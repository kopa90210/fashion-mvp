-- Gate 1: Saved and Worn History
-- Forward-only migration introducing dedicated saved outfits membership,
-- canonical wear records with explicit worn_on dates, date correction, undo,
-- server-captured garment snapshots to preserve historical combinations across garment deletion,
-- unified transactional wear recording with idempotency replay and undo protection,
-- and historical reconciliation from outfit_worn interaction events.

begin;

-- ---------------------------------------------------------------------------
-- 1. Saved Outfits
-- ---------------------------------------------------------------------------

create table if not exists public.saved_outfits (
  user_id uuid not null references public.users(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  garment_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, outfit_id)
);

create index if not exists saved_outfits_user_created_idx
  on public.saved_outfits (user_id, created_at desc, outfit_id desc);

alter table public.saved_outfits enable row level security;

revoke all on table public.saved_outfits from public, anon;
grant select, insert, update, delete on table public.saved_outfits to authenticated;
grant all on table public.saved_outfits to service_role;

drop policy if exists "saved_outfits: owner all" on public.saved_outfits;
create policy "saved_outfits: owner all"
  on public.saved_outfits for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.outfits o
      where o.id = saved_outfits.outfit_id
        and o.user_id = (select auth.uid())
        and o.source <> 'calibration'
        and o.status <> 'invalid'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Canonical Outfit Wear Records
-- ---------------------------------------------------------------------------

create table if not exists public.outfit_wear_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  worn_on date not null,
  garment_snapshot jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, outfit_id, worn_on)
);

create index if not exists outfit_wear_records_user_worn_idx
  on public.outfit_wear_records (user_id, worn_on desc, id desc);

alter table public.outfit_wear_records enable row level security;

revoke all on table public.outfit_wear_records from public, anon;
grant select, insert, update, delete on table public.outfit_wear_records to authenticated;
grant all on table public.outfit_wear_records to service_role;

drop policy if exists "outfit_wear_records: owner all" on public.outfit_wear_records;
create policy "outfit_wear_records: owner all"
  on public.outfit_wear_records for all to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.outfits o
      where o.id = outfit_wear_records.outfit_id
        and o.user_id = (select auth.uid())
        and o.source <> 'calibration'
        and o.status <> 'invalid'
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Stored Functions for Saved Looks
-- ---------------------------------------------------------------------------

create or replace function public.save_outfit_look(p_outfit_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_created_at timestamptz;
  v_snapshot jsonb;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_outfit_id is null then
    raise exception 'Invalid outfit ID' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.outfits o
    where o.id = p_outfit_id
      and o.user_id = v_user
      and o.source <> 'calibration'
      and o.status <> 'invalid'
  ) then
    raise exception 'Outfit not found or not eligible to save' using errcode = '42501';
  end if;

  -- Capture server-authorized snapshot of outfit composition
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
  into v_snapshot
  from public.outfit_items oi
  left join public.wardrobe_items wi on wi.id = oi.wardrobe_item_id
  where oi.outfit_id = p_outfit_id;

  insert into public.saved_outfits (user_id, outfit_id, garment_snapshot)
  values (v_user, p_outfit_id, v_snapshot)
  on conflict (user_id, outfit_id) do nothing
  returning created_at into v_created_at;

  if v_created_at is null then
    select created_at into v_created_at
    from public.saved_outfits
    where user_id = v_user and outfit_id = p_outfit_id;
  end if;

  return v_created_at;
end;
$$;

create or replace function public.unsave_outfit_look(p_outfit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  delete from public.saved_outfits
  where user_id = v_user and outfit_id = p_outfit_id;

  return true;
end;
$$;

revoke all on function public.save_outfit_look(uuid) from public, anon;
grant execute on function public.save_outfit_look(uuid) to authenticated, service_role;

revoke all on function public.unsave_outfit_look(uuid) from public, anon;
grant execute on function public.unsave_outfit_look(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Unified Transactional Wear Recording & Management
-- ---------------------------------------------------------------------------

create or replace function public.record_canonical_outfit_worn(
  p_outfit_id uuid,
  p_worn_on date default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_timezone text;
  v_worn_on date;
  v_record_id uuid;
  v_created_at timestamptz;
  v_interaction_id uuid;
  v_snapshot jsonb;
  v_existing_interaction public.outfit_interactions%rowtype;
  v_current_worn_on date;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_outfit_id is null then
    raise exception 'Invalid outfit ID' using errcode = '22023';
  end if;

  if p_idempotency_key is not null and (
    char_length(p_idempotency_key) not between 1 and 200 or btrim(p_idempotency_key) = ''
  ) then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  -- Advisory lock per user+outfit to serialize concurrent wear writes
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':wear:' || p_outfit_id::text, 0));

  -- Check outfit ownership and eligibility (including superseded historical outfits)
  if not exists (
    select 1 from public.outfits o
    where o.id = p_outfit_id
      and o.user_id = v_user
      and o.source <> 'calibration'
      and o.status <> 'invalid'
  ) then
    raise exception 'Outfit not found or not eligible for wear' using errcode = '42501';
  end if;

  -- 1. Idempotency replay check: If this client key was already processed
  if p_idempotency_key is not null then
    select * into v_existing_interaction
    from public.outfit_interactions
    where user_id = v_user and idempotency_key = p_idempotency_key;

    if v_existing_interaction.id is not null then
      if v_existing_interaction.outfit_id is distinct from p_outfit_id
        or v_existing_interaction.event_type is distinct from 'outfit_worn' then
        raise exception 'Idempotency key was used for a different interaction' using errcode = '22023';
      end if;

      -- Check the corresponding wear record
      v_record_id := (v_existing_interaction.context_snapshot->>'wear_record_id')::uuid;

      if v_record_id is not null then
        select worn_on, created_at into v_current_worn_on, v_created_at
        from public.outfit_wear_records
        where id = v_record_id and user_id = v_user;
      end if;

      if v_current_worn_on is not null then
        -- Wear record is still active (reflects current date, including if date was updated)
        return jsonb_build_object(
          'id', v_record_id,
          'worn_on', v_current_worn_on,
          'interaction_id', v_existing_interaction.id,
          'created_at', v_created_at,
          'replayed', true,
          'undone', false
        );
      else
        -- Operation was previously undone: DO NOT recreate wear record!
        return jsonb_build_object(
          'id', null,
          'worn_on', null,
          'interaction_id', v_existing_interaction.id,
          'created_at', v_existing_interaction.created_at,
          'replayed', true,
          'undone', true
        );
      end if;
    end if;
  end if;

  -- 2. Fresh wear write path: Resolve wear date
  if p_worn_on is not null then
    v_worn_on := p_worn_on;
  else
    select timezone into v_timezone from public.users where id = v_user;
    if v_timezone is null or not public.is_valid_iana_timezone(v_timezone) then
      v_timezone := 'UTC';
    end if;
    v_worn_on := (now() at time zone v_timezone)::date;
  end if;

  -- Server-captured snapshot of outfit composition at wear time
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
  into v_snapshot
  from public.outfit_items oi
  left join public.wardrobe_items wi on wi.id = oi.wardrobe_item_id
  where oi.outfit_id = p_outfit_id;

  -- Write canonical wear record (idempotent per user+outfit+worn_on)
  insert into public.outfit_wear_records (user_id, outfit_id, worn_on, garment_snapshot)
  values (v_user, p_outfit_id, v_worn_on, v_snapshot)
  on conflict (user_id, outfit_id, worn_on) do update
    set updated_at = now()
  returning id, created_at into v_record_id, v_created_at;

  if v_record_id is null then
    select id, created_at into v_record_id, v_created_at
    from public.outfit_wear_records
    where user_id = v_user and outfit_id = p_outfit_id and worn_on = v_worn_on;
  end if;

  -- Record behavioral event atomically in same transaction
  if p_idempotency_key is not null then
    insert into public.outfit_interactions (
      user_id, outfit_id, event_type, idempotency_key, context_snapshot
    )
    values (
      v_user,
      p_outfit_id,
      'outfit_worn',
      p_idempotency_key,
      jsonb_build_object('wear_record_id', v_record_id, 'worn_on', v_worn_on)
    )
    on conflict (user_id, idempotency_key) do nothing
    returning id into v_interaction_id;

    if v_interaction_id is null then
      select id into v_interaction_id
      from public.outfit_interactions
      where user_id = v_user and idempotency_key = p_idempotency_key;
    end if;
  end if;

  return jsonb_build_object(
    'id', v_record_id,
    'worn_on', v_worn_on,
    'interaction_id', v_interaction_id,
    'created_at', v_created_at,
    'replayed', false,
    'undone', false
  );
end;
$$;

create or replace function public.update_outfit_wear_date(
  p_wear_record_id uuid,
  p_new_worn_on date
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_outfit_id uuid;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_wear_record_id is null or p_new_worn_on is null then
    raise exception 'Invalid wear record or date' using errcode = '22023';
  end if;

  select outfit_id into v_outfit_id
  from public.outfit_wear_records
  where id = p_wear_record_id and user_id = v_user
  for update;

  if v_outfit_id is null then
    raise exception 'Wear record not found' using errcode = '42501';
  end if;

  -- Conflict check: same outfit already worn on that new date
  if exists (
    select 1 from public.outfit_wear_records
    where user_id = v_user
      and outfit_id = v_outfit_id
      and worn_on = p_new_worn_on
      and id <> p_wear_record_id
  ) then
    raise exception 'Outfit already marked as worn on this date' using errcode = '23505';
  end if;

  update public.outfit_wear_records
  set worn_on = p_new_worn_on, updated_at = now()
  where id = p_wear_record_id and user_id = v_user;

  return jsonb_build_object(
    'id', p_wear_record_id,
    'worn_on', p_new_worn_on
  );
end;
$$;

create or replace function public.undo_outfit_worn(p_wear_record_id uuid)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_wear_record_id is null then
    raise exception 'Invalid wear record ID' using errcode = '22023';
  end if;

  delete from public.outfit_wear_records
  where id = p_wear_record_id and user_id = v_user;

  return true;
end;
$$;

revoke all on function public.record_canonical_outfit_worn(uuid, date, text) from public, anon;
grant execute on function public.record_canonical_outfit_worn(uuid, date, text) to authenticated, service_role;

revoke all on function public.update_outfit_wear_date(uuid, date) from public, anon;
grant execute on function public.update_outfit_wear_date(uuid, date) to authenticated, service_role;

revoke all on function public.undo_outfit_worn(uuid) from public, anon;
grant execute on function public.undo_outfit_worn(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Forward-Only Historical Reconciliation (Backfill from outfit_worn events)
-- ---------------------------------------------------------------------------

insert into public.outfit_wear_records (user_id, outfit_id, worn_on, created_at, garment_snapshot)
select
  oi.user_id,
  oi.outfit_id,
  (oi.created_at at time zone (case when u.timezone is not null and public.is_valid_iana_timezone(u.timezone) then u.timezone else 'UTC' end))::date as worn_on,
  min(oi.created_at) as created_at,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'wardrobe_item_id', items.wardrobe_item_id,
          'slot', items.slot,
          'position', items.position,
          'category', wi.category,
          'subcategory', wi.subcategory,
          'display_name', coalesce(nullif(trim(wi.display_name), ''), nullif(trim(wi.subcategory), ''), wi.category, 'Wardrobe piece'),
          'media_asset_id', wi.media_asset_id,
          'image_url', wi.image_url
        ) order by items.position asc
      )
      from public.outfit_items items
      left join public.wardrobe_items wi on wi.id = items.wardrobe_item_id
      where items.outfit_id = oi.outfit_id
    ),
    '[]'::jsonb
  ) as garment_snapshot
from public.outfit_interactions oi
join public.users u on u.id = oi.user_id
join public.outfits o on o.id = oi.outfit_id
where oi.event_type = 'outfit_worn'
  and o.source <> 'calibration'
  and o.status <> 'invalid'
group by oi.user_id, oi.outfit_id, (oi.created_at at time zone (case when u.timezone is not null and public.is_valid_iana_timezone(u.timezone) then u.timezone else 'UTC' end))::date
on conflict (user_id, outfit_id, worn_on) do nothing;

commit;
