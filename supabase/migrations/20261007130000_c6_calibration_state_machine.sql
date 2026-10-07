-- C6.1: server-authoritative, one-outfit-at-a-time calibration.
-- LOCAL-ONLY while remote Supabase migration history remains unreconciled.
--
-- Reuses existing state instead of adding a calibration_sessions table:
--   public.preference_events          = answered calibration steps
--   public.outfits.context_snapshot   = generated calibration step
--   public.users.has_completed_calibration = terminal flag

begin;

-- One persisted calibration outfit per user + numbered step.
-- Older calibration rows without calibration_step are intentionally ignored.
create unique index if not exists outfits_one_calibration_step_per_user_idx
  on public.outfits (user_id, ((context_snapshot ->> 'calibration_step')))
  where source = 'calibration'
    and context_snapshot ? 'calibration_step';

create or replace function public.create_calibration_outfit_with_items(
  p_item_ids uuid[],
  p_reasoning jsonb default null,
  p_context_snapshot jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_outfit_id uuid;
  v_item_id uuid;
  v_slot text;
  v_position smallint := 0;
  v_slots text[] := array[]::text[];
  v_step integer;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_context_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'Context snapshot must be an object' using errcode = '22023';
  end if;

  if p_context_snapshot->>'relationship' is distinct from 'style_seed' then
    raise exception 'Calibration relationship must be style_seed' using errcode = '22023';
  end if;

  if jsonb_typeof(p_context_snapshot->'calibration_step') is distinct from 'number' then
    raise exception 'Calibration step is required' using errcode = '22023';
  end if;

  begin
    v_step := (p_context_snapshot->>'calibration_step')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'Calibration step is invalid' using errcode = '22023';
  end;

  if v_step not between 1 and 3 then
    raise exception 'Calibration step must be between 1 and 3' using errcode = '22023';
  end if;

  -- Serialize only this user's current calibration step. This makes refreshes
  -- and concurrent page requests converge on the same persisted outfit.
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':calibration:' || v_step::text, 0)
  );

  if exists (
    select 1
    from public.users u
    where u.id = v_user_id
      and u.has_completed_calibration
  ) then
    raise exception 'Calibration already completed' using errcode = '22023';
  end if;

  select o.id
  into v_outfit_id
  from public.outfits o
  where o.user_id = v_user_id
    and o.source = 'calibration'
    and o.context_snapshot->>'calibration_step' = v_step::text
  order by o.created_at desc
  limit 1;

  if v_outfit_id is not null then
    return v_outfit_id;
  end if;

  if coalesce(cardinality(p_item_ids), 0) not between 2 and 5
    or cardinality(p_item_ids) <> cardinality(array(select distinct unnest(p_item_ids))) then
    raise exception 'Calibration outfit must contain two to five distinct items' using errcode = '22023';
  end if;

  foreach v_item_id in array p_item_ids loop
    select public.wardrobe_item_slot(
      wi.category,
      wi.subcategory,
      wi.display_name,
      wi.layer_role
    )
    into v_slot
    from public.user_style_seed_items usi
    join public.wardrobe_items wi on wi.id = usi.item_id
    where usi.user_id = v_user_id
      and usi.item_id = v_item_id
      and usi.retired_at is null
      and wi.source = 'curated'
      and wi.status = 'confirmed';

    if v_slot is null then
      raise exception 'Item is not an active confirmed style seed' using errcode = '22023';
    end if;

    if v_slot = any(v_slots) then
      raise exception 'Calibration outfit has duplicate slots' using errcode = '22023';
    end if;

    v_slots := array_append(v_slots, v_slot);
  end loop;

  if not public.is_valid_outfit_slots(v_slots) then
    raise exception 'Calibration outfit is missing a required slot' using errcode = '22023';
  end if;

  insert into public.outfits (
    user_id,
    item_ids,
    source,
    scheduled_for,
    reasoning,
    generator_version,
    context_snapshot,
    fashion_dna_updated_at
  )
  values (
    v_user_id,
    to_jsonb(p_item_ids),
    'calibration',
    null,
    p_reasoning,
    'deterministic-calibration-v2',
    p_context_snapshot,
    (select updated_at from public.fashion_dna where user_id = v_user_id)
  )
  returning id into v_outfit_id;

  foreach v_item_id in array p_item_ids loop
    insert into public.outfit_items (
      outfit_id,
      wardrobe_item_id,
      slot,
      position
    )
    values (
      v_outfit_id,
      v_item_id,
      v_slots[v_position + 1],
      v_position
    );
    v_position := v_position + 1;
  end loop;

  return v_outfit_id;

exception
  when unique_violation then
    select o.id
    into v_outfit_id
    from public.outfits o
    where o.user_id = v_user_id
      and o.source = 'calibration'
      and o.context_snapshot->>'calibration_step' = v_step::text
    order by o.created_at desc
    limit 1;

    if v_outfit_id is not null then
      return v_outfit_id;
    end if;

    raise;
end;
$$;

revoke all on function public.create_calibration_outfit_with_items(uuid[], jsonb, jsonb)
  from public, anon;
grant execute on function public.create_calibration_outfit_with_items(uuid[], jsonb, jsonb)
  to authenticated, service_role;

comment on function public.create_calibration_outfit_with_items(uuid[], jsonb, jsonb) is
  'Creates at most one calibration outfit per user/step using active curated style seeds.';

-- Calibration-specific feedback wrapper.
-- The client no longer decides whether a response is "the final outfit".
-- Completion is derived from the idempotent preference-event ledger.
create or replace function public.submit_calibration_feedback(
  p_outfit_id uuid,
  p_liked boolean,
  p_idempotency_key text
)
returns table (
  vector jsonb,
  changed_tags text[],
  version integer,
  event_id uuid,
  answered_count integer,
  completed boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_source text;
  v_vector jsonb;
  v_changed_tags text[];
  v_version integer;
  v_event_id uuid;
  v_answered_count integer;
  v_completed boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select o.source
  into v_source
  from public.outfits o
  where o.id = p_outfit_id
    and o.user_id = v_user_id;

  if v_source is null then
    raise exception 'Outfit not found' using errcode = '42501';
  end if;

  if v_source <> 'calibration' then
    raise exception 'Calibration feedback requires a calibration outfit' using errcode = '22023';
  end if;

  select
    result.vector,
    result.changed_tags,
    result.version,
    result.event_id
  into
    v_vector,
    v_changed_tags,
    v_version,
    v_event_id
  from public.submit_outfit_feedback(
    p_outfit_id,
    p_liked,
    'calibration',
    p_idempotency_key
  ) as result;

  select count(*)::integer
  into v_answered_count
  from public.preference_events pe
  where pe.user_id = v_user_id
    and pe.event_type = 'outfit_feedback'
    and pe.payload->>'source' = 'calibration';

  v_completed := v_answered_count >= 3;

  if v_completed then
    update public.users
    set has_completed_calibration = true
    where id = v_user_id
      and has_completed_calibration is distinct from true;
  end if;

  vector := v_vector;
  changed_tags := coalesce(v_changed_tags, array[]::text[]);
  version := v_version;
  event_id := v_event_id;
  answered_count := v_answered_count;
  completed := v_completed;
  return next;
end;
$$;

revoke all on function public.submit_calibration_feedback(uuid, boolean, text)
  from public, anon;
grant execute on function public.submit_calibration_feedback(uuid, boolean, text)
  to authenticated, service_role;

comment on function public.submit_calibration_feedback(uuid, boolean, text) is
  'Records idempotent calibration feedback and completes calibration after three distinct answered outfits.';

commit;
