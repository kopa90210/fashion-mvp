-- Gate 3: Signature Look
-- Forward-only migration introducing dedicated 1-to-1 signature look table,
-- server-captured snapshots preserving defining look composition across garment deletion,
-- concurrency protection with advisory transaction locks, monotonic versioning,
-- strict eligibility validation (outfit must belong to user, non-calibration, non-invalid,
-- and present in Saved or Worn collection at time of pinning).

begin;

-- ---------------------------------------------------------------------------
-- 1. Table: public.user_signature_looks
-- ---------------------------------------------------------------------------

create table if not exists public.user_signature_looks (
  user_id uuid primary key references public.users(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  garment_snapshot jsonb not null default '[]'::jsonb,
  outfit_snapshot jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  pinned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_signature_looks_outfit_id_idx
  on public.user_signature_looks (outfit_id);

alter table public.user_signature_looks enable row level security;

revoke all on table public.user_signature_looks from public, anon;
grant select, insert, update, delete on table public.user_signature_looks to authenticated;
grant all on table public.user_signature_looks to service_role;

drop policy if exists "user_signature_looks: owner all" on public.user_signature_looks;
create policy "user_signature_looks: owner all"
  on public.user_signature_looks for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 2. Stored Function: public.set_signature_look
-- ---------------------------------------------------------------------------

create or replace function public.set_signature_look(
  p_outfit_id uuid,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_outfit record;
  v_current record;
  v_garment_snapshot jsonb;
  v_outfit_snapshot jsonb;
  v_next_version integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_outfit_id is null then
    raise exception 'Invalid outfit ID' using errcode = '22023';
  end if;

  -- User-level transaction lock for concurrency safety
  perform pg_advisory_xact_lock(hashtext('user_signature:' || v_user::text));

  -- Verify outfit belongs to user, is not calibration, and is not invalid
  select o.source, o.status, o.created_at, o.scheduled_for, o.styling_tip, o.reasoning
  into v_outfit
  from public.outfits o
  where o.id = p_outfit_id
    and o.user_id = v_user
    and o.source <> 'calibration'
    and o.status <> 'invalid';

  if v_outfit.source is null then
    raise exception 'Outfit not eligible: not found, invalid, or calibration' using errcode = '42501';
  end if;

  -- Eligibility: outfit must currently exist in either Saved or Worn collection
  if not (
    exists (select 1 from public.saved_outfits s where s.user_id = v_user and s.outfit_id = p_outfit_id)
    or
    exists (select 1 from public.outfit_wear_records w where w.user_id = v_user and w.outfit_id = p_outfit_id)
  ) then
    raise exception 'Outfit not eligible: must be in Saved or Worn collection' using errcode = '42501';
  end if;

  -- Inspect current signature look
  select * into v_current
  from public.user_signature_looks
  where user_id = v_user;

  -- Concurrency check on expected version if provided
  if p_expected_version is not null and v_current.user_id is not null and v_current.version <> p_expected_version then
    raise exception 'Signature look version conflict' using errcode = '40900';
  end if;

  -- Idempotency check: already pinned to this exact outfit
  if v_current.user_id is not null and v_current.outfit_id = p_outfit_id then
    return jsonb_build_object(
      'user_id', v_user,
      'outfit_id', v_current.outfit_id,
      'version', v_current.version,
      'pinned_at', v_current.pinned_at,
      'replayed', true
    );
  end if;

  -- Capture server-authorized snapshot of outfit garment composition
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'wardrobe_item_id', oi.wardrobe_item_id,
      'slot', oi.slot,
      'position', oi.position,
      'category', wi.category,
      'subcategory', wi.subcategory,
      'display_name', coalesce(nullif(trim(wi.display_name), ''), nullif(trim(wi.subcategory), ''), wi.category, 'Wardrobe piece'),
      'media_asset_id', wi.media_asset_id,
      'image_url', wi.image_url
    ) order by oi.position asc
  ), '[]'::jsonb)
  into v_garment_snapshot
  from public.outfit_items oi
  left join public.wardrobe_items wi on wi.id = oi.wardrobe_item_id
  where oi.outfit_id = p_outfit_id;

  -- Capture outfit metadata snapshot
  v_outfit_snapshot := jsonb_build_object(
    'source', v_outfit.source,
    'status', v_outfit.status,
    'created_at', v_outfit.created_at,
    'scheduled_for', v_outfit.scheduled_for,
    'styling_tip', v_outfit.styling_tip,
    'reasoning', coalesce(v_outfit.reasoning, '[]'::jsonb)
  );

  v_next_version := coalesce(v_current.version, 0) + 1;

  insert into public.user_signature_looks (
    user_id,
    outfit_id,
    garment_snapshot,
    outfit_snapshot,
    version,
    pinned_at,
    updated_at
  ) values (
    v_user,
    p_outfit_id,
    v_garment_snapshot,
    v_outfit_snapshot,
    v_next_version,
    v_now,
    v_now
  )
  on conflict (user_id) do update set
    outfit_id = excluded.outfit_id,
    garment_snapshot = excluded.garment_snapshot,
    outfit_snapshot = excluded.outfit_snapshot,
    version = v_next_version,
    pinned_at = v_now,
    updated_at = v_now;

  return jsonb_build_object(
    'user_id', v_user,
    'outfit_id', p_outfit_id,
    'version', v_next_version,
    'pinned_at', v_now,
    'replayed', false
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Stored Function: public.clear_signature_look
-- ---------------------------------------------------------------------------

create or replace function public.clear_signature_look(
  p_expected_version integer default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_current record;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- User-level transaction lock
  perform pg_advisory_xact_lock(hashtext('user_signature:' || v_user::text));

  select * into v_current
  from public.user_signature_looks
  where user_id = v_user;

  if v_current.user_id is not null and p_expected_version is not null and v_current.version <> p_expected_version then
    raise exception 'Signature look version conflict' using errcode = '40900';
  end if;

  delete from public.user_signature_looks
  where user_id = v_user;

  return true;
end;
$$;

revoke all on function public.set_signature_look(uuid, integer) from public, anon;
grant execute on function public.set_signature_look(uuid, integer) to authenticated, service_role;

revoke all on function public.clear_signature_look(integer) from public, anon;
grant execute on function public.clear_signature_look(integer) to authenticated, service_role;

commit;
