-- Reconcile the partially applied Gate 4 Fashion DNA quiz path.
--
-- The target schema already contains fashion_dna_versions, but it is missing
-- both the baseline trigger and submit_style_quiz RPC. Keep quiz persistence
-- transactional and close the legacy direct-write path at the same time.
begin;

create or replace function public.seed_fashion_dna_baseline()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  insert into public.fashion_dna_versions (
    user_id,
    version,
    vector,
    algorithm_version
  )
  values (
    new.user_id,
    0,
    new.vector,
    'signup-baseline-v1'
  )
  on conflict (user_id, version) do nothing;

  return new;
end;
$$;

drop trigger if exists seed_fashion_dna_baseline_after_insert
  on public.fashion_dna;
create trigger seed_fashion_dna_baseline_after_insert
after insert on public.fashion_dna
for each row execute function public.seed_fashion_dna_baseline();

revoke all on function public.seed_fashion_dna_baseline()
  from public, anon, authenticated;

revoke insert, update, delete on public.fashion_dna
  from public, anon, authenticated;
drop policy if exists "fashion_dna: owner all" on public.fashion_dna;
drop policy if exists "fashion_dna: owner select" on public.fashion_dna;
create policy "fashion_dna: owner select"
on public.fashion_dna
for select
to authenticated
using (user_id = (select auth.uid()));

create or replace function public.submit_style_quiz(
  p_vector jsonb,
  p_shopping_motivation text default null,
  p_risk_tolerance text default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_version integer;
  v_dimensions text[] := array[
    'minimal',
    'casual',
    'smart_casual',
    'streetwear',
    'classic',
    'old_money',
    'sporty',
    'relaxed',
    'vintage',
    'trend_forward',
    'formal',
    'edgy'
  ];
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_vector is null or jsonb_typeof(p_vector) <> 'object' then
    raise exception 'Invalid style vector' using errcode = '22023';
  end if;

  if (select count(*) from jsonb_object_keys(p_vector)) <> 12
    or not (p_vector ?& v_dimensions)
    or exists (
      select 1
      from jsonb_each(p_vector) as e
      where jsonb_typeof(e.value) <> 'number'
        or (e.value::text)::numeric < 0
        or (e.value::text)::numeric > 1
    ) then
    raise exception 'Invalid style vector' using errcode = '22023';
  end if;

  if p_shopping_motivation is not null
    and p_shopping_motivation not in (
      'matches-wardrobe',
      'looks-unique',
      'quality-worth-it',
      'price-is-right'
    ) then
    raise exception 'Invalid shopping motivation' using errcode = '22023';
  end if;

  if p_risk_tolerance is not null
    and p_risk_tolerance not in (
      'safe-combinations',
      'sometimes-different',
      'love-experimenting',
      'depends-on-mood'
    ) then
    raise exception 'Invalid risk tolerance' using errcode = '22023';
  end if;

  -- Older profiles may predate the auth trigger that creates fashion_dna.
  insert into public.fashion_dna (user_id)
  values (v_user_id)
  on conflict (user_id) do nothing;

  perform 1
  from public.fashion_dna as fd
  where fd.user_id = v_user_id
  for update;

  if not found then
    raise exception 'Fashion DNA not found' using errcode = 'P0002';
  end if;

  select coalesce(max(fdv.version), -1) + 1
  into v_version
  from public.fashion_dna_versions as fdv
  where fdv.user_id = v_user_id;

  insert into public.fashion_dna_versions (
    user_id,
    version,
    vector,
    algorithm_version
  )
  values (
    v_user_id,
    v_version,
    p_vector,
    'style-quiz-v1'
  );

  update public.fashion_dna as fd
  set vector = p_vector,
      shopping_motivation = coalesce(
        p_shopping_motivation,
        fd.shopping_motivation
      ),
      risk_tolerance = coalesce(p_risk_tolerance, fd.risk_tolerance),
      updated_at = now()
  where fd.user_id = v_user_id;

  return v_version;
end;
$$;

revoke all on function public.submit_style_quiz(jsonb, text, text)
  from public, anon;
grant execute on function public.submit_style_quiz(jsonb, text, text)
  to authenticated, service_role;

commit;
