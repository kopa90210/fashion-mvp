-- 0015_phase4b_gate2_security.sql
-- Phase 4B Gate 2B: Backend-Only Mutation Boundary & Provenance Hardening

-- ---------------------------------------------------------------------------
-- 0. Drop Obsolete Function Overloads and Signatures
-- ---------------------------------------------------------------------------
-- Drop legacy 1-param create_draft_wardrobe_item(text) from migration 0013
drop function if exists public.create_draft_wardrobe_item(text);

-- Drop legacy 2-param client-callable transition RPCs from earlier Gate 2 drafts
drop function if exists public.transition_wardrobe_item_processing_state(uuid, text);
drop function if exists public.transition_wardrobe_item_prettify_state(uuid, text);

-- ---------------------------------------------------------------------------
-- 1. source_photos Row-Level Security & Mutability Hardening
-- ---------------------------------------------------------------------------
alter table public.source_photos enable row level security;

drop policy if exists "source_photos: owner all" on public.source_photos;
drop policy if exists "source_photos: owner select" on public.source_photos;
drop policy if exists "source_photos: owner insert" on public.source_photos;
drop policy if exists "source_photos: owner update" on public.source_photos;
drop policy if exists "source_photos: owner delete" on public.source_photos;

-- 1.1 SELECT: Owner only
create policy "source_photos: owner select"
  on public.source_photos for select
  to authenticated
  using (auth.uid() = user_id);

-- 1.2 INSERT: Owner only; status must start as 'uploading' or 'detecting'
create policy "source_photos: owner insert"
  on public.source_photos for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and status in ('uploading', 'detecting')
  );

-- 1.3 DELETE: Owner only
create policy "source_photos: owner delete"
  on public.source_photos for delete
  to authenticated
  using (auth.uid() = user_id);

-- 1.4 Mutability Boundary:
-- Revoke direct UPDATE on source_photos from authenticated/anon roles.
-- Immutable fields: id, user_id, created_at, idempotency_key, file_hash
-- Backend-controlled: status (updated exclusively by orchestrator / service_role)
revoke update on public.source_photos from public, anon, authenticated;
grant select, insert, delete on public.source_photos to authenticated;
grant select, insert, update, delete on public.source_photos to service_role;

-- ---------------------------------------------------------------------------
-- 2. wardrobe_items Row-Level Security & Insertion Hardening
-- ---------------------------------------------------------------------------
alter table public.wardrobe_items enable row level security;

drop policy if exists "wardrobe_items: authenticated select" on public.wardrobe_items;
drop policy if exists "wardrobe_items: select curated or own" on public.wardrobe_items;
drop policy if exists "wardrobe_items: insert user_upload" on public.wardrobe_items;
drop policy if exists "wardrobe_items: authenticated insert user_upload" on public.wardrobe_items;
drop policy if exists "wardrobe_items: owner structured update" on public.wardrobe_items;

-- 2.1 SELECT: Curated catalog is public to authenticated users; user uploads are private to owner
create policy "wardrobe_items: select curated or own"
  on public.wardrobe_items for select
  to authenticated
  using (
    source = 'curated'
    or exists (
      select 1 from public.user_wardrobe_items uwi
      where uwi.item_id = wardrobe_items.id
        and uwi.user_id = auth.uid()
    )
  );

-- 2.2 INSERT Boundary:
-- Revoke direct INSERT on wardrobe_items from authenticated/anon roles.
-- All user-upload wardrobe items MUST be created via create_draft_wardrobe_item RPC.
revoke insert on public.wardrobe_items from public, anon, authenticated;
grant insert on public.wardrobe_items to service_role;

-- 2.3 UPDATE: Owner can update verified descriptive metadata only
create policy "wardrobe_items: owner structured update"
  on public.wardrobe_items for update
  to authenticated
  using (
    source = 'user_upload'
    and exists (
      select 1 from public.user_wardrobe_items uwi
      where uwi.item_id = wardrobe_items.id
        and uwi.user_id = auth.uid()
    )
  )
  with check (
    source = 'user_upload'
    and exists (
      select 1 from public.user_wardrobe_items uwi
      where uwi.item_id = wardrobe_items.id
        and uwi.user_id = auth.uid()
    )
  );

grant select on public.wardrobe_items to authenticated;
grant select, update, delete on public.wardrobe_items to service_role;

-- Exact verified column whitelist for client updates (no pipeline or provenance columns)
grant update (
  display_name,
  brand,
  color,
  material,
  fit,
  pattern,
  category,
  subcategory,
  style_tags,
  layer_role,
  formality_score,
  season_weights,
  image_url,
  status
) on public.wardrobe_items to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Provenance-Enforcing Draft Wardrobe Item RPC
-- ---------------------------------------------------------------------------
create or replace function public.create_draft_wardrobe_item(
  p_image_url text,
  p_source_photo_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
  v_item_id uuid;
  v_photo_owner uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Verify source photo provenance & ownership if supplied
  if p_source_photo_id is not null then
    select user_id into v_photo_owner
    from public.source_photos
    where id = p_source_photo_id;

    if v_photo_owner is null or v_photo_owner <> v_user_id then
      raise exception 'Source photo not found or ownership mismatch' using errcode = '42501';
    end if;
  end if;

  -- Insert wardrobe item with guaranteed initial pipeline states
  insert into public.wardrobe_items (
    image_url,
    source,
    status,
    source_photo_id,
    processing_status,
    prettify_status
  )
  values (
    p_image_url,
    'user_upload',
    'draft',
    p_source_photo_id,
    'detected',
    'none'
  )
  returning id into v_item_id;

  -- Link ownership atomically
  insert into public.user_wardrobe_items (user_id, item_id, quantity)
  values (v_user_id, v_item_id, 1);

  return v_item_id;
end;
$$;

revoke all on function public.create_draft_wardrobe_item(text, uuid) from public, anon;
grant execute on function public.create_draft_wardrobe_item(text, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Backend-Only State Mutation Authorization RPCs
-- ---------------------------------------------------------------------------

-- 4.1 Processing State Transition RPC (Backend / Orchestrator Only)
create or replace function public.transition_wardrobe_item_processing_state(
  p_item_id uuid,
  p_target_status text,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_status text;
  v_is_valid boolean := false;
begin
  if p_user_id is null then
    raise exception 'Target user context (p_user_id) is required' using errcode = '42501';
  end if;

  -- Verify ownership via user_wardrobe_items for the target user
  if not exists (
    select 1 from public.user_wardrobe_items
    where item_id = p_item_id and user_id = p_user_id
  ) then
    raise exception 'Item % not found or not owned by user %', p_item_id, p_user_id using errcode = '42501';
  end if;

  -- Lock row and read current processing_status
  select processing_status into v_current_status
  from public.wardrobe_items
  where id = p_item_id
  for update;

  if v_current_status is null then
    raise exception 'Wardrobe item % not found', p_item_id using errcode = 'P0002';
  end if;

  -- Authoritative Processing State Machine:
  -- detected   -> isolating, failed
  -- isolating  -> isolated, failed
  -- isolated   -> extracting, failed
  -- extracting -> extracted, failed
  -- failed     -> isolating, detected
  if (v_current_status = 'detected' and p_target_status in ('isolating', 'failed')) or
     (v_current_status = 'isolating' and p_target_status in ('isolated', 'failed')) or
     (v_current_status = 'isolated' and p_target_status in ('extracting', 'failed')) or
     (v_current_status = 'extracting' and p_target_status in ('extracted', 'failed')) or
     (v_current_status = 'failed' and p_target_status in ('isolating', 'detected')) then
    v_is_valid := true;
  end if;

  if not v_is_valid then
    raise exception 'Invalid processing state transition from % to % for item %',
      v_current_status, p_target_status, p_item_id using errcode = '22023';
  end if;

  -- Set transaction-local flag for defense-in-depth trigger
  perform set_config('app.pipeline_transition', 'true', true);

  update public.wardrobe_items
  set processing_status = p_target_status
  where id = p_item_id;

  return p_target_status;
end;
$$;

revoke all on function public.transition_wardrobe_item_processing_state(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.transition_wardrobe_item_processing_state(uuid, text, uuid) to service_role;

-- 4.2 Prettify State Transition RPC (Backend / Orchestrator Only)
create or replace function public.transition_wardrobe_item_prettify_state(
  p_item_id uuid,
  p_target_status text,
  p_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current_status text;
  v_is_valid boolean := false;
begin
  if p_user_id is null then
    raise exception 'Target user context (p_user_id) is required' using errcode = '42501';
  end if;

  -- Verify ownership via user_wardrobe_items for the target user
  if not exists (
    select 1 from public.user_wardrobe_items
    where item_id = p_item_id and user_id = p_user_id
  ) then
    raise exception 'Item % not found or not owned by user %', p_item_id, p_user_id using errcode = '42501';
  end if;

  -- Lock row and read current prettify_status
  select prettify_status into v_current_status
  from public.wardrobe_items
  where id = p_item_id
  for update;

  if v_current_status is null then
    raise exception 'Wardrobe item % not found', p_item_id using errcode = 'P0002';
  end if;

  -- Authoritative Prettify State Machine:
  -- none       -> processing
  -- processing -> done, failed
  -- failed     -> processing
  if (v_current_status = 'none' and p_target_status = 'processing') or
     (v_current_status = 'processing' and p_target_status in ('done', 'failed')) or
     (v_current_status = 'failed' and p_target_status in ('processing')) then
    v_is_valid := true;
  end if;

  if not v_is_valid then
    raise exception 'Invalid prettify state transition from % to % for item %',
      v_current_status, p_target_status, p_item_id using errcode = '22023';
  end if;

  -- Set transaction-local flag for defense-in-depth trigger
  perform set_config('app.pipeline_transition', 'true', true);

  update public.wardrobe_items
  set prettify_status = p_target_status
  where id = p_item_id;

  return p_target_status;
end;
$$;

revoke all on function public.transition_wardrobe_item_prettify_state(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.transition_wardrobe_item_prettify_state(uuid, text, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Defense-in-Depth Pipeline State Guard Trigger
-- ---------------------------------------------------------------------------
create or replace function public.guard_wardrobe_item_pipeline_transitions()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- If transition is NOT marked by trusted RPC, block direct tampering
  if nullif(current_setting('app.pipeline_transition', true), '') is null then
    if (new.processing_status is distinct from old.processing_status) then
      raise exception 'Direct update of processing_status is forbidden. Transitions must occur via backend orchestrator.'
        using errcode = '42501';
    end if;

    if (new.prettify_status is distinct from old.prettify_status) then
      raise exception 'Direct update of prettify_status is forbidden. Transitions must occur via backend orchestrator.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_wardrobe_item_pipeline_transitions on public.wardrobe_items;

create trigger trg_guard_wardrobe_item_pipeline_transitions
  before update on public.wardrobe_items
  for each row
  execute function public.guard_wardrobe_item_pipeline_transitions();
