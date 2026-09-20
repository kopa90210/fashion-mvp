-- Gate 5: durable AI work. Depends on the unapplied Gate 3/4 migrations.
-- Local draft only: do not apply until earlier gates and disposable DB tests pass.
begin;

-- A service-role worker must never follow an owner-controlled asset row into
-- another user's Storage folder. NOT VALID preserves any legacy rows for audit.
alter table public.media_assets add constraint media_assets_path_owner_check
  check (split_part(object_path, '/', 1) = owner_id::text) not valid;

create type public.ai_job_type as enum ('daily_outfit', 'wardrobe_extraction');
create type public.ai_job_status as enum ('queued', 'running', 'retry_wait', 'succeeded', 'dead_letter');
create type public.ai_run_status as enum ('succeeded', 'retryable_error', 'permanent_error', 'stale_lease');

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  job_type public.ai_job_type not null,
  idempotency_key text not null check (length(idempotency_key) between 1 and 200),
  wardrobe_item_id uuid references public.wardrobe_items(id) on delete set null,
  scheduled_for date,
  status public.ai_job_status not null default 'queued',
  attempts integer not null default 0 check (attempts >= 0),
  total_attempts integer not null default 0 check (total_attempts >= attempts),
  max_attempts integer not null default 3 check (max_attempts between 1 and 8),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  safe_error_code text check (safe_error_code is null or safe_error_code in
    ('PROVIDER_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_INVALID','INVALID_INPUT','STALE_LEASE','PERSISTENCE_FAILED')),
  result_outfit_id uuid references public.outfits(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, job_type, idempotency_key),
  constraint ai_jobs_shape_check check ((job_type = 'daily_outfit' and scheduled_for is not null and wardrobe_item_id is null)
      or (job_type = 'wardrobe_extraction' and scheduled_for is null)),
  check ((status = 'running' and lease_owner is not null and lease_expires_at is not null)
      or (status <> 'running' and lease_owner is null and lease_expires_at is null))
);

create index ai_jobs_claim_idx on public.ai_jobs (available_at, created_at)
  where status in ('queued', 'retry_wait');
create index ai_jobs_expired_idx on public.ai_jobs (lease_expires_at)
  where status = 'running';
create index ai_jobs_user_status_idx on public.ai_jobs (user_id, status, created_at desc);

create table public.ai_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.ai_jobs(id) on delete cascade,
  attempt integer not null check (attempt > 0),
  status public.ai_run_status not null,
  provider text not null check (length(provider) between 1 and 80),
  model text not null check (length(model) between 1 and 120),
  prompt_version text not null check (length(prompt_version) between 1 and 80),
  schema_version text not null check (length(schema_version) between 1 and 80),
  validation_status text not null check (validation_status in ('valid','invalid','not_run')),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  safe_error_code text check (safe_error_code is null or safe_error_code in
    ('PROVIDER_UNAVAILABLE','PROVIDER_TIMEOUT','PROVIDER_INVALID','INVALID_INPUT','STALE_LEASE','PERSISTENCE_FAILED')),
  outfit_id uuid references public.outfits(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, attempt)
);
create index ai_runs_job_created_idx on public.ai_runs (job_id, created_at desc);

alter table public.outfits
  add column ai_job_id uuid references public.ai_jobs(id) on delete set null,
  add column ai_run_id uuid references public.ai_runs(id) on delete set null;
create unique index outfits_ai_run_unique_idx on public.outfits (ai_run_id) where ai_run_id is not null;
alter table public.wardrobe_items
  add column extraction_ai_run_id uuid references public.ai_runs(id) on delete set null;

alter table public.ai_jobs enable row level security;
alter table public.ai_runs enable row level security;
revoke all on public.ai_jobs, public.ai_runs from public, anon, authenticated;
grant select on public.ai_jobs, public.ai_runs to authenticated;
grant all on public.ai_jobs, public.ai_runs to service_role;
create policy "ai_jobs: owner select" on public.ai_jobs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "ai_runs: owner select" on public.ai_runs for select to authenticated
  using (exists (select 1 from public.ai_jobs j where j.id = ai_runs.job_id and j.user_id = (select auth.uid())));

create or replace function public.enqueue_daily_outfit_job()
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_user uuid := auth.uid(); v_date date; v_job uuid; v_timezone text;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select timezone into v_timezone from public.users where id = v_user;
  if not public.is_valid_iana_timezone(v_timezone) then raise exception 'Invalid timezone' using errcode = '22023'; end if;
  v_date := (now() at time zone v_timezone)::date;
  insert into public.ai_jobs (user_id, job_type, idempotency_key, scheduled_for)
  values (v_user, 'daily_outfit', 'daily:' || v_date::text || ':v1', v_date)
  on conflict (user_id, job_type, idempotency_key) do update set updated_at = public.ai_jobs.updated_at
  returning id into v_job;
  return v_job;
end; $$;
revoke all on function public.enqueue_daily_outfit_job() from public, anon;
grant execute on function public.enqueue_daily_outfit_job() to authenticated;

create or replace function public.enqueue_wardrobe_extraction_job(p_item_id uuid)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_user uuid := auth.uid(); v_job uuid;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.user_wardrobe_items uwi
    join public.wardrobe_items wi on wi.id = uwi.item_id
    join public.media_assets ma on ma.id = wi.media_asset_id
    where uwi.user_id = v_user and uwi.item_id = p_item_id and uwi.retired_at is null
      and wi.source = 'user_upload' and wi.status = 'draft'
      and ma.owner_id = v_user and split_part(ma.object_path, '/', 1) = v_user::text
      and ma.kind = 'wardrobe_item' and ma.status = 'active'
  ) then raise exception 'Draft item or private media not available' using errcode = '42501'; end if;
  insert into public.ai_jobs (user_id, job_type, idempotency_key, wardrobe_item_id)
  values (v_user, 'wardrobe_extraction', 'extract:' || p_item_id::text || ':v1', p_item_id)
  on conflict (user_id, job_type, idempotency_key) do update set updated_at = public.ai_jobs.updated_at
  returning id into v_job;
  return v_job;
end; $$;
revoke all on function public.enqueue_wardrobe_extraction_job(uuid) from public, anon;
grant execute on function public.enqueue_wardrobe_extraction_job(uuid) to authenticated;

create or replace function public.claim_ai_jobs(p_worker_id text, p_limit integer default 1, p_lease_seconds integer default 120)
returns setof public.ai_jobs language plpgsql security definer set search_path = pg_catalog as $$
declare v_stale public.ai_jobs%rowtype;
begin
  if p_worker_id is null or length(p_worker_id) not between 1 and 100
    or p_limit not between 1 and 10 or p_lease_seconds not between 30 and 900 then
    raise exception 'Invalid claim parameters' using errcode = '22023';
  end if;
  for v_stale in
    select * from public.ai_jobs where status = 'running' and lease_expires_at < now()
    order by lease_expires_at limit p_limit * 2 for update skip locked
  loop
    insert into public.ai_runs (job_id, attempt, status, provider, model, prompt_version, schema_version, validation_status, safe_error_code)
    values (v_stale.id, v_stale.total_attempts, 'stale_lease', 'unknown', 'unknown', 'unknown', 'unknown', 'not_run', 'STALE_LEASE')
    on conflict (job_id, attempt) do nothing;
    update public.ai_jobs set status = case when attempts >= max_attempts then 'dead_letter'::public.ai_job_status else 'retry_wait'::public.ai_job_status end,
      available_at = now(), lease_owner = null, lease_expires_at = null,
      safe_error_code = 'STALE_LEASE', updated_at = now() where id = v_stale.id;
  end loop;
  return query
    with next_jobs as (
      select id from public.ai_jobs
      where status in ('queued','retry_wait') and available_at <= now() and attempts < max_attempts
      order by available_at, created_at limit p_limit for update skip locked
    )
    update public.ai_jobs j set status = 'running', attempts = j.attempts + 1, total_attempts = j.total_attempts + 1,
      lease_owner = p_worker_id, lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    from next_jobs n where j.id = n.id returning j.*;
end; $$;
revoke all on function public.claim_ai_jobs(text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_jobs(text, integer, integer) to service_role;

create or replace function public.requeue_dead_ai_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
begin
  update public.ai_jobs set status = 'queued', attempts = 0, available_at = now(),
    safe_error_code = null, updated_at = now()
  where id = p_job_id and status = 'dead_letter';
  if not found then raise exception 'Dead-letter job not found' using errcode = 'P0002'; end if;
end; $$;
revoke all on function public.requeue_dead_ai_job(uuid) from public, anon, authenticated;
grant execute on function public.requeue_dead_ai_job(uuid) to service_role;

create or replace function public.complete_ai_job(
  p_job_id uuid, p_worker_id text, p_attempt integer, p_outcome text,
  p_provider text, p_model text, p_prompt_version text, p_schema_version text,
  p_validation_status text, p_latency_ms integer, p_usage jsonb,
  p_safe_error_code text, p_result jsonb
)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_job public.ai_jobs%rowtype; v_run_id uuid; v_outfit_id uuid;
  v_ids uuid[]; v_item_id uuid; v_roles text[] := array[]::text[]; v_role text;
  v_position integer := 0; v_source text; v_confidence numeric;
  v_category text; v_name text; v_color text;
begin
  select * into v_job from public.ai_jobs where id = p_job_id for update;
  if not found or v_job.status <> 'running' or v_job.lease_owner is distinct from p_worker_id
    or v_job.total_attempts <> p_attempt or v_job.lease_expires_at <= now() then
    raise exception 'Job lease is not current' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('succeeded','retryable_error','permanent_error')
    or p_provider is null or p_model is null or p_prompt_version is null or p_schema_version is null
    or p_validation_status not in ('valid','invalid','not_run')
    or p_latency_ms is null or p_latency_ms < 0
    or coalesce(jsonb_typeof(p_usage), 'null') <> 'object' then
    raise exception 'Invalid run metadata' using errcode = '22023';
  end if;
  if (p_outcome = 'succeeded' and (p_safe_error_code is not null or p_validation_status <> 'valid' or coalesce(jsonb_typeof(p_result), 'null') <> 'object'))
    or (p_outcome <> 'succeeded' and (p_safe_error_code is null or p_result is not null)) then
    raise exception 'Invalid run outcome' using errcode = '22023';
  end if;

  insert into public.ai_runs (job_id, attempt, status, provider, model, prompt_version,
    schema_version, validation_status, latency_ms, usage, safe_error_code)
  values (v_job.id, p_attempt, p_outcome::public.ai_run_status, p_provider, p_model,
    p_prompt_version, p_schema_version, p_validation_status, p_latency_ms, p_usage, p_safe_error_code)
  returning id into v_run_id;

  if p_outcome = 'succeeded' and v_job.job_type = 'daily_outfit' then
    if jsonb_typeof(p_result->'item_ids') is distinct from 'array'
      or jsonb_typeof(p_result->'reasoning') is distinct from 'array'
      or p_result->>'source' is null or p_result->>'source' not in ('daily_ai','daily_fallback') then
      raise exception 'Invalid outfit result' using errcode = '22023';
    end if;
    if jsonb_array_length(p_result->'reasoning') > 10
      or exists (select 1 from jsonb_array_elements(p_result->'reasoning') as reason(value)
        where jsonb_typeof(reason.value) <> 'string' or length(reason.value #>> '{}') > 500)
      or length(coalesce(p_result->>'styling_tip', '')) > 500 then
      raise exception 'Invalid outfit explanation' using errcode = '22023';
    end if;
    v_ids := array(select value::uuid from jsonb_array_elements_text(p_result->'item_ids'));
    if cardinality(v_ids) not between 3 and 5
      or cardinality(v_ids) <> cardinality(array(select distinct unnest(v_ids))) then
      raise exception 'Invalid outfit items' using errcode = '22023';
    end if;
    v_confidence := (p_result->>'confidence')::numeric;
    if v_confidence is null or v_confidence < 0 or v_confidence > 1 then
      raise exception 'Invalid outfit confidence' using errcode = '22023';
    end if;
    foreach v_item_id in array v_ids loop
      select wi.layer_role into v_role from public.user_wardrobe_items uwi
      join public.wardrobe_items wi on wi.id = uwi.item_id
      where uwi.user_id = v_job.user_id and uwi.item_id = v_item_id
        and uwi.retired_at is null and wi.status = 'confirmed';
      if v_role is null or v_role not in ('base_layer','bottom','footwear','outerwear','accessory')
        or v_role = any(v_roles) then
        raise exception 'Outfit item is invalid or unavailable' using errcode = '22023';
      end if;
      v_roles := array_append(v_roles, v_role);
    end loop;
    if not ('base_layer' = any(v_roles) and 'bottom' = any(v_roles) and 'footwear' = any(v_roles)) then
      raise exception 'Outfit missing required role' using errcode = '22023';
    end if;
    v_source := p_result->>'source';
    insert into public.outfits (user_id, item_ids, source, scheduled_for, reasoning,
      styling_tip, confidence, generator_version, context_snapshot, ai_job_id, ai_run_id)
    values (v_job.user_id, to_jsonb(v_ids), v_source, v_job.scheduled_for,
      p_result->'reasoning', p_result->>'styling_tip', v_confidence,
      p_model || ':' || p_prompt_version, jsonb_build_object('job_id', v_job.id), v_job.id, v_run_id)
    on conflict do nothing returning id into v_outfit_id;
    if v_outfit_id is null then
      select id into v_outfit_id from public.outfits where user_id = v_job.user_id
        and scheduled_for = v_job.scheduled_for and source in ('daily_ai','daily_fallback')
        and status = 'generated' limit 1;
      if v_outfit_id is null then raise exception 'Outfit could not be persisted' using errcode = '23505'; end if;
    else
      foreach v_item_id in array v_ids loop
        insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position)
        values (v_outfit_id, v_item_id, v_roles[v_position + 1], v_position);
        v_position := v_position + 1;
      end loop;
    end if;
    update public.ai_runs set outfit_id = v_outfit_id where id = v_run_id;
  elsif p_outcome = 'succeeded' and v_job.job_type = 'wardrobe_extraction' then
    v_category := p_result->>'category';
    v_name := p_result->>'display_name';
    v_color := p_result->>'color_primary';
    v_confidence := (p_result->>'confidence')::numeric;
    if v_category is null or v_category not in ('top','bottom','footwear','outerwear','accessory')
      or v_name is null or length(trim(v_name)) not between 1 and 120
      or v_color is null or length(trim(v_color)) not between 1 and 80
      or v_confidence is null or v_confidence < 0 or v_confidence > 1 then
      raise exception 'Invalid extraction result' using errcode = '22023';
    end if;
    perform set_config('app.pipeline_transition', 'true', true);
    update public.wardrobe_items wi set category = v_category, display_name = v_name,
      color = jsonb_build_object('primary', v_color), model_confidence = v_confidence,
      layer_role = case v_category when 'top' then 'base_layer' else v_category end,
      processing_status = 'extracted', extraction_ai_run_id = v_run_id
    where wi.id = v_job.wardrobe_item_id and wi.source = 'user_upload' and wi.status = 'draft'
      and exists (select 1 from public.user_wardrobe_items uwi
        where uwi.user_id = v_job.user_id and uwi.item_id = wi.id and uwi.retired_at is null);
    if not found then raise exception 'Draft item no longer available' using errcode = '22023'; end if;
  end if;

  update public.ai_jobs set
    status = case when p_outcome = 'succeeded' then 'succeeded'::public.ai_job_status
      when p_outcome = 'permanent_error' or attempts >= max_attempts then 'dead_letter'::public.ai_job_status
      else 'retry_wait'::public.ai_job_status end,
    available_at = case when p_outcome = 'retryable_error' and attempts < max_attempts
      then now() + make_interval(secs => least(3600, 5 * power(2, attempts - 1)::integer))
      else now() end,
    lease_owner = null, lease_expires_at = null, safe_error_code = p_safe_error_code,
    result_outfit_id = v_outfit_id, updated_at = now()
  where id = v_job.id;
  return v_outfit_id;
end; $$;
revoke all on function public.complete_ai_job(uuid, text, integer, text, text, text, text, text, text, integer, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_ai_job(uuid, text, integer, text, text, text, text, text, text, integer, jsonb, text, jsonb)
  to service_role;

commit;
