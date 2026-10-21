-- Gate 4: idempotent feedback and reconstructable Fashion DNA.
-- Depends on the unapplied Gate 3 relational-outfit migration. Local-only.
begin;

create type public.preference_event_type as enum ('outfit_feedback');

create table public.preference_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  event_type public.preference_event_type not null,
  outfit_id uuid references public.outfits(id) on delete set null,
  wardrobe_item_id uuid references public.wardrobe_items(id) on delete set null,
  idempotency_key text not null check (length(trim(idempotency_key)) between 1 and 200),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique (user_id, event_type, outfit_id)
);
create index preference_events_user_occurred_idx on public.preference_events (user_id, occurred_at desc);

create table public.fashion_dna_versions (
  user_id uuid not null references public.users(id) on delete cascade,
  version integer not null check (version >= 0),
  vector jsonb not null check (jsonb_typeof(vector) = 'object'),
  algorithm_version text not null,
  source_event_id uuid references public.preference_events(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, version),
  unique (source_event_id)
);

insert into public.fashion_dna_versions (user_id, version, vector, algorithm_version, created_at)
select user_id, 0, vector, 'legacy-baseline-v1', updated_at
from public.fashion_dna
on conflict (user_id, version) do nothing;

alter table public.preference_events enable row level security;
alter table public.fashion_dna_versions enable row level security;
revoke all on public.preference_events, public.fashion_dna_versions from public, anon, authenticated;
grant select on public.preference_events, public.fashion_dna_versions to authenticated;
grant all on public.preference_events, public.fashion_dna_versions to service_role;
create policy "preference_events: owner select" on public.preference_events for select to authenticated using (user_id = (select auth.uid()));
create policy "fashion_dna_versions: owner select" on public.fashion_dna_versions for select to authenticated using (user_id = (select auth.uid()));

-- Preserve analytics reads but force every new feedback row through the RPC.
revoke insert, update, delete on public.feedback from public, anon, authenticated;
drop policy if exists "feedback: owner all" on public.feedback;
create policy "feedback: owner select" on public.feedback for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.submit_outfit_feedback(
  p_outfit_id uuid,
  p_liked boolean,
  p_feedback_source text,
  p_idempotency_key text
)
returns table (vector jsonb, changed_tags text[], version integer, event_id uuid)
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user_id uuid := auth.uid(); v_event public.preference_events%rowtype;
  v_current jsonb; v_next jsonb; v_version integer; v_tag record; v_changed text[] := array[]::text[];
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_feedback_source is null or p_feedback_source not in ('daily', 'calibration') then raise exception 'Invalid feedback source' using errcode = '22023'; end if;
  if p_liked is null then raise exception 'Feedback choice is required' using errcode = '22023'; end if;
  if p_idempotency_key is null or length(trim(p_idempotency_key)) not between 1 and 200 then raise exception 'Invalid idempotency key' using errcode = '22023'; end if;
  if not exists (select 1 from public.outfits where id = p_outfit_id and user_id = v_user_id) then
    raise exception 'Outfit not found' using errcode = '42501';
  end if;
  perform 1 from public.fashion_dna fd where fd.user_id = v_user_id for update;
  if not found then raise exception 'Fashion DNA not found' using errcode = 'P0002'; end if;
  select * into v_event from public.preference_events where user_id = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_event.outfit_id is distinct from p_outfit_id
      or v_event.payload->>'liked' is distinct from p_liked::text
      or v_event.payload->>'source' is distinct from p_feedback_source then
      raise exception 'Idempotency key was used for a different response' using errcode = '22023';
    end if;
    select fdv.vector, fdv.version into vector, version from public.fashion_dna_versions fdv where fdv.source_event_id = v_event.id;
    if not found then raise exception 'Feedback version missing' using errcode = 'P0002'; end if;
    changed_tags := coalesce(array(select jsonb_array_elements_text(v_event.payload->'changed_tags')), array[]::text[]);
    event_id := v_event.id; return next; return;
  end if;
  select fd.vector into v_current from public.fashion_dna fd where fd.user_id = v_user_id;
  if v_current is null then raise exception 'Fashion DNA not found' using errcode = 'P0002'; end if;
  v_next := v_current;
  for v_tag in
    select distinct tags.key from public.outfit_items oi join public.wardrobe_items wi on wi.id = oi.wardrobe_item_id
    cross join lateral jsonb_each(case when jsonb_typeof(wi.style_tags) = 'object' then wi.style_tags else '{}'::jsonb end) as tags(key, value)
    where oi.outfit_id = p_outfit_id and case when jsonb_typeof(tags.value) = 'number' then (tags.value::text)::numeric > 0 else false end
    order by tags.key
  loop
    v_changed := array_append(v_changed, v_tag.key);
    v_next := jsonb_set(v_next, array[v_tag.key], to_jsonb(least(1::numeric, greatest(0::numeric, round((coalesce((v_next->>v_tag.key)::numeric, 0) + case when p_liked then .05 else -.05 end)::numeric, 2)))), true);
  end loop;
  if not exists (select 1 from public.outfit_items oi where oi.outfit_id = p_outfit_id) then
    raise exception 'Outfit has no normalized items' using errcode = '22023';
  end if;
  insert into public.preference_events (user_id, event_type, outfit_id, idempotency_key, payload)
  values (v_user_id, 'outfit_feedback', p_outfit_id, p_idempotency_key, jsonb_build_object('liked', p_liked, 'source', p_feedback_source, 'changed_tags', v_changed)) returning * into v_event;
  insert into public.feedback (user_id, outfit_id, liked, source) values (v_user_id, p_outfit_id, p_liked, p_feedback_source);
  select coalesce(max(fdv.version), -1) + 1 into v_version from public.fashion_dna_versions fdv where fdv.user_id = v_user_id;
  insert into public.fashion_dna_versions (user_id, version, vector, algorithm_version, source_event_id)
  values (v_user_id, v_version, v_next, 'feedback-delta-v1', v_event.id);
  update public.fashion_dna fd set vector = v_next, updated_at = now() where fd.user_id = v_user_id;
  vector := v_next; changed_tags := v_changed; version := v_version; event_id := v_event.id; return next;
end; $$;
revoke all on function public.submit_outfit_feedback(uuid, boolean, text, text) from public, anon;
grant execute on function public.submit_outfit_feedback(uuid, boolean, text, text) to authenticated, service_role;

-- New accounts begin at version zero; historical accounts were seeded above.
create or replace function public.seed_fashion_dna_baseline()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  insert into public.fashion_dna_versions (user_id, version, vector, algorithm_version)
  values (new.user_id, 0, new.vector, 'signup-baseline-v1')
  on conflict (user_id, version) do nothing;
  return new;
end; $$;
create trigger seed_fashion_dna_baseline_after_insert
after insert on public.fashion_dna for each row execute function public.seed_fashion_dna_baseline();
revoke all on function public.seed_fashion_dna_baseline() from public, anon, authenticated;

-- Quiz updates also need a version, so direct client mutation is closed.
revoke insert, update, delete on public.fashion_dna from public, anon, authenticated;
drop policy if exists "fashion_dna: owner all" on public.fashion_dna;
create policy "fashion_dna: owner select" on public.fashion_dna for select to authenticated
using (user_id = (select auth.uid()));

create or replace function public.submit_style_quiz(
  p_vector jsonb,
  p_shopping_motivation text default null,
  p_risk_tolerance text default null
)
returns integer language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user_id uuid := auth.uid(); v_version integer;
  v_dimensions text[] := array['minimal','casual','smart_casual','streetwear','classic','old_money','sporty','relaxed','vintage','trend_forward','formal','edgy'];
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_vector is null or jsonb_typeof(p_vector) <> 'object' then
    raise exception 'Invalid style vector' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_object_keys(p_vector)) <> 12
    or not (p_vector ?& v_dimensions)
    or exists (select 1 from jsonb_each(p_vector) e where jsonb_typeof(e.value) <> 'number' or (e.value::text)::numeric < 0 or (e.value::text)::numeric > 1) then
    raise exception 'Invalid style vector' using errcode = '22023';
  end if;
  if p_shopping_motivation is not null and p_shopping_motivation not in ('matches-wardrobe','looks-unique','quality-worth-it','price-is-right') then
    raise exception 'Invalid shopping motivation' using errcode = '22023';
  end if;
  if p_risk_tolerance is not null and p_risk_tolerance not in ('safe-combinations','sometimes-different','love-experimenting','depends-on-mood') then
    raise exception 'Invalid risk tolerance' using errcode = '22023';
  end if;
  -- Older profiles may predate the auth trigger that creates fashion_dna.
  insert into public.fashion_dna (user_id) values (v_user_id) on conflict (user_id) do nothing;
  perform 1 from public.fashion_dna fd where fd.user_id = v_user_id for update;
  if not found then raise exception 'Fashion DNA not found' using errcode = 'P0002'; end if;
  select coalesce(max(fdv.version), -1) + 1 into v_version from public.fashion_dna_versions fdv where fdv.user_id = v_user_id;
  insert into public.fashion_dna_versions (user_id, version, vector, algorithm_version)
  values (v_user_id, v_version, p_vector, 'style-quiz-v1');
  update public.fashion_dna fd set vector = p_vector,
    shopping_motivation = coalesce(p_shopping_motivation, fd.shopping_motivation),
    risk_tolerance = coalesce(p_risk_tolerance, fd.risk_tolerance), updated_at = now()
  where fd.user_id = v_user_id;
  return v_version;
end; $$;
revoke all on function public.submit_style_quiz(jsonb, text, text) from public, anon;
grant execute on function public.submit_style_quiz(jsonb, text, text) to authenticated, service_role;
commit;
