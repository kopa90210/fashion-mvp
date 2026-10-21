-- Gate 3: relational outfit membership and idempotent daily generation.
-- Local-only until the documented Gate 2 exception is resolved.

begin;

create or replace function public.is_valid_iana_timezone(p_timezone text)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select p_timezone = 'UTC'
    or (
      p_timezone ~ '^[A-Za-z]+(?:/[A-Za-z0-9_+\-]+)+$'
      and exists (select 1 from pg_timezone_names where name = p_timezone)
    )
$$;

alter table public.users
  add column if not exists timezone text not null default 'UTC';

alter table public.users
  add constraint users_timezone_iana_check
  check (public.is_valid_iana_timezone(timezone)) not valid;

alter table public.outfits
  add column if not exists scheduled_for date,
  add column if not exists status text not null default 'generated',
  add column if not exists generator_version text,
  add column if not exists context_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists fashion_dna_updated_at timestamptz;

alter table public.outfits
  add constraint outfits_status_check
  check (status in ('generated', 'superseded', 'invalid')) not valid,
  add constraint outfits_confidence_range_check
  check (confidence is null or (confidence >= 0 and confidence <= 1)) not valid,
  add constraint outfits_context_snapshot_object_check
  check (jsonb_typeof(context_snapshot) = 'object') not valid,
  add constraint outfits_daily_requires_scheduled_for_check
  check (source not in ('daily_ai', 'daily_fallback') or scheduled_for is not null) not valid;

create table if not exists public.outfit_items (
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  wardrobe_item_id uuid not null references public.wardrobe_items(id) on delete cascade,
  slot text not null check (slot in ('base_layer', 'bottom', 'footwear', 'outerwear', 'accessory')),
  position smallint not null check (position >= 0 and position < 5),
  score_contribution numeric check (score_contribution is null or (score_contribution >= 0 and score_contribution <= 1)),
  created_at timestamptz not null default now(),
  primary key (outfit_id, wardrobe_item_id),
  unique (outfit_id, slot),
  unique (outfit_id, position)
);

create index if not exists outfit_items_wardrobe_item_idx
  on public.outfit_items (wardrobe_item_id);

create index if not exists outfits_daily_lookup_idx
  on public.outfits (user_id, scheduled_for, created_at desc)
  where source in ('daily_ai', 'daily_fallback') and status = 'generated';

create table if not exists public.outfit_backfill_anomalies (
  outfit_id uuid primary key references public.outfits(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  anomaly_codes text[] not null,
  legacy_item_ids jsonb,
  recorded_at timestamptz not null default now()
);

alter table public.outfit_items enable row level security;
alter table public.outfit_backfill_anomalies enable row level security;

revoke all on table public.outfit_items, public.outfit_backfill_anomalies from public, anon, authenticated;
grant select on table public.outfit_items, public.outfit_backfill_anomalies to authenticated;
grant all on table public.outfit_items, public.outfit_backfill_anomalies to service_role;

create policy "outfit_items: outfit owner select"
  on public.outfit_items for select to authenticated
  using (exists (
    select 1 from public.outfits o
    where o.id = outfit_items.outfit_id and o.user_id = (select auth.uid())
  ));

create policy "outfit_backfill_anomalies: owner select"
  on public.outfit_backfill_anomalies for select to authenticated
  using (user_id = (select auth.uid()));

-- Direct client writes would bypass relational validation. All new writes use
-- create_outfit_with_items below; existing rows remain readable via RLS.
revoke insert, update, delete on public.outfits from public, anon, authenticated;
drop policy if exists "outfits: owner all" on public.outfits;
create policy "outfits: owner select" on public.outfits for select to authenticated
  using (user_id = (select auth.uid()));

do $$
declare
  v_outfit record;
  v_value jsonb;
  v_text text;
  v_item_id uuid;
  v_slot text;
  v_position smallint;
  v_item_ids uuid[];
  v_slots text[];
  v_codes text[];
  v_timezone text;
  v_scheduled_for date;
  v_existing_daily boolean;
begin
  for v_outfit in
    select o.id, o.user_id, o.item_ids, o.source, o.created_at
    from public.outfits o
    order by o.created_at desc, o.id desc
  loop
    v_codes := array[]::text[];
    v_item_ids := array[]::uuid[];
    v_slots := array[]::text[];

    select u.timezone into v_timezone from public.users u where u.id = v_outfit.user_id;
    if not public.is_valid_iana_timezone(v_timezone) then
      v_codes := array_append(v_codes, 'invalid_user_timezone');
      v_timezone := 'UTC';
    end if;

    if jsonb_typeof(v_outfit.item_ids) <> 'array' then
      v_codes := array_append(v_codes, 'item_ids_not_array');
    else
      for v_value in select value from jsonb_array_elements(v_outfit.item_ids)
      loop
        if jsonb_typeof(v_value) <> 'string' then
          v_codes := array_append(v_codes, 'item_id_not_string');
          continue;
        end if;
        v_text := v_value #>> '{}';
        if v_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
          v_codes := array_append(v_codes, 'item_id_not_uuid');
          continue;
        end if;
        v_item_id := v_text::uuid;
        if v_item_id = any(v_item_ids) then
          v_codes := array_append(v_codes, 'duplicate_item_id');
          continue;
        end if;
        select case wi.layer_role
          when 'base_layer' then 'base_layer'
          when 'bottom' then 'bottom'
          when 'footwear' then 'footwear'
          when 'outerwear' then 'outerwear'
          when 'accessory' then 'accessory'
          else null
        end into v_slot
        from public.wardrobe_items wi
        where wi.id = v_item_id;
        if not found then
          v_codes := array_append(v_codes, 'missing_wardrobe_item');
          continue;
        end if;
        if v_slot is null then
          v_codes := array_append(v_codes, 'invalid_layer_role');
          continue;
        end if;
        if v_slot = any(v_slots) then
          v_codes := array_append(v_codes, 'duplicate_slot');
          continue;
        end if;
        if not exists (
          select 1 from public.user_wardrobe_items uwi
          where uwi.user_id = v_outfit.user_id and uwi.item_id = v_item_id and uwi.retired_at is null
        ) then
          v_codes := array_append(v_codes, 'item_not_in_active_wardrobe');
          continue;
        end if;
        v_item_ids := array_append(v_item_ids, v_item_id);
        v_slots := array_append(v_slots, v_slot);
      end loop;
    end if;

    if cardinality(v_item_ids) < 3
      or not ('base_layer' = any(v_slots) and 'bottom' = any(v_slots) and 'footwear' = any(v_slots)) then
      v_codes := array_append(v_codes, 'missing_required_slot');
    end if;

    if v_outfit.source in ('daily_ai', 'daily_fallback') then
      v_scheduled_for := (v_outfit.created_at at time zone v_timezone)::date;
      select exists (
        select 1 from public.outfits existing
        where existing.user_id = v_outfit.user_id
          and existing.source in ('daily_ai', 'daily_fallback')
          and existing.scheduled_for = v_scheduled_for
          and existing.status = 'generated'
      ) into v_existing_daily;
      if v_existing_daily then
        v_codes := array_append(v_codes, 'duplicate_daily_date');
        update public.outfits set scheduled_for = v_scheduled_for, status = 'superseded' where id = v_outfit.id;
      else
        update public.outfits set scheduled_for = v_scheduled_for where id = v_outfit.id;
      end if;
    end if;

    if cardinality(v_codes) > 0 then
      insert into public.outfit_backfill_anomalies (outfit_id, user_id, anomaly_codes, legacy_item_ids)
      values (v_outfit.id, v_outfit.user_id, (select array_agg(distinct code) from unnest(v_codes) code), v_outfit.item_ids)
      on conflict (outfit_id) do update set anomaly_codes = excluded.anomaly_codes, legacy_item_ids = excluded.legacy_item_ids;
      if v_outfit.source in ('daily_ai', 'daily_fallback') and not v_existing_daily then
        update public.outfits set status = 'invalid' where id = v_outfit.id;
      end if;
      continue;
    end if;

    for v_position in 1..cardinality(v_item_ids) loop
      insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position)
      values (v_outfit.id, v_item_ids[v_position], v_slots[v_position], v_position - 1);
    end loop;
  end loop;
end;
$$;

create unique index outfits_one_generated_daily_per_user_date_idx
  on public.outfits (user_id, scheduled_for)
  where source in ('daily_ai', 'daily_fallback') and status = 'generated';

create or replace function public.create_outfit_with_items(
  p_item_ids uuid[],
  p_source text,
  p_reasoning jsonb default null,
  p_styling_tip text default null,
  p_confidence numeric default null,
  p_generator_version text default null,
  p_context_snapshot jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_timezone text;
  v_scheduled_for date;
  v_outfit_id uuid;
  v_item_id uuid;
  v_slot text;
  v_position smallint := 0;
  v_slots text[] := array[]::text[];
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_source not in ('engine', 'daily_ai', 'daily_fallback', 'manual') then raise exception 'Invalid outfit source' using errcode = '22023'; end if;
  if p_confidence is not null and (p_confidence < 0 or p_confidence > 1) then raise exception 'Invalid confidence' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_context_snapshot, '{}'::jsonb)) <> 'object' then raise exception 'Context snapshot must be an object' using errcode = '22023'; end if;
  if cardinality(p_item_ids) < 3 or cardinality(p_item_ids) <> cardinality(array(select distinct unnest(p_item_ids))) then
    raise exception 'Outfit must contain at least three distinct items' using errcode = '22023';
  end if;

  select timezone into v_timezone from public.users where id = v_user_id;
  if not public.is_valid_iana_timezone(v_timezone) then raise exception 'User timezone is invalid' using errcode = '22023'; end if;
  if p_source in ('daily_ai', 'daily_fallback') then
    v_scheduled_for := (now() at time zone v_timezone)::date;
    perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || v_scheduled_for::text, 0));
    select id into v_outfit_id from public.outfits
      where user_id = v_user_id and scheduled_for = v_scheduled_for
        and source in ('daily_ai', 'daily_fallback') and status = 'generated'
      limit 1 for update;
    if v_outfit_id is not null then return v_outfit_id; end if;
  end if;

  foreach v_item_id in array p_item_ids loop
    select case wi.layer_role
      when 'base_layer' then 'base_layer' when 'bottom' then 'bottom'
      when 'footwear' then 'footwear' when 'outerwear' then 'outerwear'
      when 'accessory' then 'accessory' else null end
    into v_slot
    from public.user_wardrobe_items uwi
    join public.wardrobe_items wi on wi.id = uwi.item_id
    where uwi.user_id = v_user_id and uwi.item_id = v_item_id and uwi.retired_at is null;
    if v_slot is null then raise exception 'Item is not in the active wardrobe or has an invalid role' using errcode = '22023'; end if;
    if v_slot = any(v_slots) then raise exception 'Outfit has duplicate slots' using errcode = '22023'; end if;
    v_slots := array_append(v_slots, v_slot);
  end loop;
  if not ('base_layer' = any(v_slots) and 'bottom' = any(v_slots) and 'footwear' = any(v_slots)) then
    raise exception 'Outfit is missing a required slot' using errcode = '22023';
  end if;

  insert into public.outfits (user_id, item_ids, source, scheduled_for, reasoning, styling_tip, confidence, generator_version, context_snapshot, fashion_dna_updated_at)
  values (v_user_id, to_jsonb(p_item_ids), p_source, v_scheduled_for, p_reasoning, p_styling_tip, p_confidence, p_generator_version, coalesce(p_context_snapshot, '{}'::jsonb),
    (select updated_at from public.fashion_dna where user_id = v_user_id))
  returning id into v_outfit_id;
  foreach v_item_id in array p_item_ids loop
    insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position)
    values (v_outfit_id, v_item_id, v_slots[v_position + 1], v_position);
    v_position := v_position + 1;
  end loop;
  return v_outfit_id;
exception when unique_violation then
  if p_source in ('daily_ai', 'daily_fallback') then
    select id into v_outfit_id from public.outfits
      where user_id = v_user_id and scheduled_for = v_scheduled_for
        and source in ('daily_ai', 'daily_fallback') and status = 'generated'
      limit 1;
    if v_outfit_id is not null then return v_outfit_id; end if;
  end if;
  raise;
end;
$$;

revoke all on function public.create_outfit_with_items(uuid[], text, jsonb, text, numeric, text, jsonb) from public, anon;
grant execute on function public.create_outfit_with_items(uuid[], text, jsonb, text, numeric, text, jsonb) to authenticated, service_role;

commit;
