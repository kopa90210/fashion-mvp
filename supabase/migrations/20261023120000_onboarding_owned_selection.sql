-- Explicit ownership intent for new onboarding runs. Historical style seeds are
-- deliberately not backfilled.
begin;

create table public.onboarding_owned_selections (
  user_id uuid primary key references public.users(id) on delete cascade,
  item_ids uuid[] not null default '{}'::uuid[],
  version integer not null default 0 check (version >= 0),
  committed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.user_style_seed_items
  add column calibration_only boolean not null default false;
alter table public.user_style_seed_items
  add column onboarding_selection boolean not null default false;

alter table public.onboarding_owned_selections enable row level security;
revoke all on public.onboarding_owned_selections from public, anon, authenticated;
grant select on public.onboarding_owned_selections to authenticated;
grant all on public.onboarding_owned_selections to service_role;
create policy "onboarding_owned_selections: owner read"
  on public.onboarding_owned_selections for select to authenticated
  using (user_id = (select auth.uid()));

create function public.set_onboarding_owned_selection(
  p_item_ids uuid[], p_expected_version integer
) returns integer
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_row public.onboarding_owned_selections%rowtype;
  v_ids uuid[] := coalesce(p_item_ids, '{}'::uuid[]);
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_expected_version is null or p_expected_version < 0
    or cardinality(v_ids) > 100
    or cardinality(v_ids) <> cardinality(array(select distinct unnest(v_ids)))
    or array_position(v_ids, null) is not null then
    raise exception 'Invalid selection' using errcode = '22023';
  end if;
  -- The per-user advisory lock also covers the first insert, when no row exists.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':onboarding-ownership', 0));
  insert into public.onboarding_owned_selections(user_id) values (v_user)
    on conflict (user_id) do nothing;
  select * into v_row from public.onboarding_owned_selections
    where user_id = v_user for update;
  if v_row.committed_at is not null or
     (select has_completed_calibration from public.users where id = v_user) then
    raise exception 'Onboarding already completed' using errcode = '22023';
  end if;
  if v_row.version <> p_expected_version then
    raise exception 'Selection changed; reload and try again' using errcode = '40001';
  end if;
  if exists (
    select 1 from unnest(v_ids) selected(id)
    left join public.wardrobe_items wi on wi.id = selected.id
      and wi.source = 'curated' and wi.status = 'confirmed'
    where wi.id is null
  ) then
    raise exception 'Selection contains an unavailable piece' using errcode = '22023';
  end if;
  update public.onboarding_owned_selections
    set item_ids = v_ids, version = version + 1, updated_at = now()
    where user_id = v_user returning * into v_row;
  -- Style seeds drive calibration only. Retire old active seeds; never infer
  -- ownership from them during finalization.
  update public.user_style_seed_items set retired_at = now()
    where user_id = v_user and onboarding_selection
      and retired_at is null and not (item_id = any(v_ids));
  insert into public.user_style_seed_items(user_id, item_id, retired_at, calibration_only, onboarding_selection)
    select v_user, id, null, false, true from unnest(v_ids) selected(id)
    on conflict (user_id, item_id) do update
      set retired_at = null,
          onboarding_selection = public.user_style_seed_items.onboarding_selection
            or public.user_style_seed_items.calibration_only,
          calibration_only = false;
  return v_row.version;
end;
$$;
revoke all on function public.set_onboarding_owned_selection(uuid[], integer) from public, anon;
grant execute on function public.set_onboarding_owned_selection(uuid[], integer) to authenticated;

create function public.finalize_onboarding_owned_selection(p_expected_version integer)
returns table(item_count integer, completed boolean, selection_version integer)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_row public.onboarding_owned_selections%rowtype;
  v_answered integer;
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':onboarding-ownership', 0));
  select * into v_row from public.onboarding_owned_selections
    where user_id = v_user for update;
  if not found then
    raise exception 'No ownership selection to finalize' using errcode = '22023';
  end if;
  if p_expected_version is distinct from v_row.version then
    raise exception 'Selection changed; reload and try again' using errcode = '40001';
  end if;
  if v_row.committed_at is not null then
    return query select cardinality(v_row.item_ids), true, v_row.version;
    return;
  end if;
  select count(*)::integer into v_answered from public.preference_events pe
    where pe.user_id = v_user and pe.event_type = 'outfit_feedback'
      and pe.payload->>'source' = 'calibration';
  if v_answered < 3 then
    raise exception 'Calibration is not complete' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_row.item_ids) selected(id)
    left join public.wardrobe_items wi on wi.id = selected.id
      and wi.source = 'curated' and wi.status = 'confirmed'
    where wi.id is null
  ) then
    raise exception 'Selection contains an unavailable piece' using errcode = '22023';
  end if;
  insert into public.user_wardrobe_items(user_id, item_id, quantity, retired_at)
    select v_user, id, 1, null from unnest(v_row.item_ids) selected(id)
    on conflict (user_id, item_id) do update set retired_at = null;
  -- Invalidate pre-commit work before freeing the generated daily slot. A
  -- running worker holds the job row lock while persisting, so this waits for
  -- it and the following update supersedes any outfit it produced.
  update public.ai_jobs j
    set status = 'dead_letter', lease_owner = null, lease_expires_at = null,
        safe_error_code = 'STALE_LEASE', updated_at = now()
    where j.user_id = v_user and j.job_type = 'daily_outfit'
      and j.scheduled_for = (
        now() at time zone (select u.timezone from public.users u where u.id = v_user)
      )::date
      and j.status in ('queued', 'running', 'retry_wait');
  -- Keep prior daily rows and their interactions as history, while freeing
  -- today's generated slot for the updated owned wardrobe.
  update public.outfits o set status = 'superseded'
    where o.user_id = v_user and o.source in ('daily_ai', 'daily_fallback')
      and o.status = 'generated'
      and o.scheduled_for = (
        now() at time zone (select u.timezone from public.users u where u.id = v_user)
      )::date;
  update public.users set has_completed_calibration = true where id = v_user;
  update public.onboarding_owned_selections set committed_at = now()
    where user_id = v_user;
  return query select cardinality(v_row.item_ids), true, v_row.version;
end;
$$;
revoke all on function public.finalize_onboarding_owned_selection(integer) from public, anon;
grant execute on function public.finalize_onboarding_owned_selection(integer) to authenticated;

-- A post-commit AI job must not reuse an earlier same-day job built from the
-- old wardrobe. The version is server-read from committed pending state.
create or replace function public.enqueue_daily_outfit_job()
returns uuid language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_date date;
  v_job uuid;
  v_timezone text;
  v_selection_version integer;
  v_key text;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':onboarding-ownership', 0));
  select timezone into v_timezone from public.users where id = v_user;
  if not public.is_valid_iana_timezone(v_timezone) then
    raise exception 'Invalid timezone' using errcode = '22023';
  end if;
  v_date := (now() at time zone v_timezone)::date;
  select version into v_selection_version from public.onboarding_owned_selections
    where user_id = v_user and committed_at is not null;
  v_key := 'daily:' || v_date::text || ':v1';
  if v_selection_version is not null then
    v_key := v_key || ':onboarding:' || v_selection_version::text;
  end if;
  insert into public.ai_jobs(user_id, job_type, idempotency_key, scheduled_for)
    values (v_user, 'daily_outfit', v_key, v_date)
    on conflict (user_id, job_type, idempotency_key)
      do update set updated_at = public.ai_jobs.updated_at
    returning id into v_job;
  return v_job;
end;
$$;
revoke all on function public.enqueue_daily_outfit_job() from public, anon;
grant execute on function public.enqueue_daily_outfit_job() to authenticated;

-- The third preference event makes the user ready to finalize; it must not
-- commit onboarding or ownership on its own.
create or replace function public.submit_calibration_feedback(
  p_outfit_id uuid, p_liked boolean, p_idempotency_key text
) returns table (
  vector jsonb, changed_tags text[], version integer, event_id uuid,
  answered_count integer, completed boolean
)
language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.outfits o where o.id = p_outfit_id
    and o.user_id = v_user and o.source = 'calibration') then
    raise exception 'Calibration outfit not found' using errcode = '42501';
  end if;
  select r.vector, r.changed_tags, r.version, r.event_id
    into vector, changed_tags, version, event_id
    from public.submit_outfit_feedback(p_outfit_id, p_liked, 'calibration', p_idempotency_key) r;
  select count(*)::integer into answered_count from public.preference_events pe
    where pe.user_id = v_user and pe.event_type = 'outfit_feedback'
      and pe.payload->>'source' = 'calibration';
  completed := answered_count >= 3;
  return next;
end;
$$;

commit;
