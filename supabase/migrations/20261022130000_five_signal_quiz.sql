-- Local-only: migration ledger version 0014 is unresolved.
-- Nullable signals preserve saved results for existing users.
begin;
alter table public.fashion_dna add column if not exists quiz_signals jsonb;

create or replace function public.submit_style_quiz(
  p_vector jsonb,
  p_shopping_motivation text,
  p_risk_tolerance text,
  p_quiz_signals jsonb
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

  if p_quiz_signals is null or jsonb_typeof(p_quiz_signals) <> 'object'
    or coalesce(p_quiz_signals->>'primaryOccasion', '') not in ('work-university','everyday-errands','going-out','mixed')
    or coalesce(p_quiz_signals->>'style', '') not in ('minimal','classic','relaxed','streetwear')
    or coalesce(p_quiz_signals->>'fit', '') not in ('slim','regular','relaxed','oversized')
    or coalesce(p_quiz_signals->>'formality', '') not in ('casual','put-together','polished','formal')
    or coalesce(p_quiz_signals->>'exploration', '') not in ('familiar','small-twist','mix-it-up','bold')
    or (select count(*) from jsonb_object_keys(p_quiz_signals)) <> 5 then
    raise exception 'Invalid quiz signals' using errcode = '22023';
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
    'style-quiz-v2'
  );

  update public.fashion_dna as fd
  set vector = p_vector,
      shopping_motivation = coalesce(
        p_shopping_motivation,
        fd.shopping_motivation
      ),
      risk_tolerance = coalesce(p_risk_tolerance, fd.risk_tolerance),
      quiz_signals = p_quiz_signals,
      updated_at = now()
  where fd.user_id = v_user_id;

  return v_version;
end;
$$;


revoke all on function public.submit_style_quiz(jsonb, text, text, jsonb) from public, anon;
grant execute on function public.submit_style_quiz(jsonb, text, text, jsonb) to authenticated, service_role;
commit;
