-- BE-1: behavioral events are independent of style feedback and Fashion DNA.
begin;

create table public.outfit_interactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  outfit_id uuid not null references public.outfits(id) on delete cascade,
  event_type text not null check (event_type in ('outfit_viewed', 'outfit_worn', 'outfit_not_today')),
  item_id uuid references public.wardrobe_items(id) on delete set null,
  replacement_item_id uuid references public.wardrobe_items(id) on delete set null,
  context_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(context_snapshot) = 'object'),
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200 and btrim(idempotency_key) <> ''),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index outfit_interactions_user_created_idx on public.outfit_interactions (user_id, created_at desc);
create index outfit_interactions_outfit_idx on public.outfit_interactions (outfit_id);
create index outfit_interactions_item_idx on public.outfit_interactions (item_id) where item_id is not null;
create index outfit_interactions_replacement_idx on public.outfit_interactions (replacement_item_id) where replacement_item_id is not null;

alter table public.outfit_interactions enable row level security;
revoke all on public.outfit_interactions from public, anon, authenticated, service_role;
grant select on public.outfit_interactions to authenticated;
create policy "outfit_interactions: owner select" on public.outfit_interactions
  for select to authenticated using (user_id = (select auth.uid()));

create function public.record_outfit_interaction(
  p_outfit_id uuid,
  p_event_type text,
  p_idempotency_key text,
  p_context_snapshot jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = pg_catalog as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_existing public.outfit_interactions%rowtype;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_event_type is null or p_event_type not in ('outfit_viewed', 'outfit_worn', 'outfit_not_today') then
    raise exception 'Invalid interaction event' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 200 or btrim(p_idempotency_key) = '' then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;
  if p_context_snapshot is null or jsonb_typeof(p_context_snapshot) <> 'object' then
    raise exception 'Invalid interaction context' using errcode = '22023';
  end if;

  -- Stabilize ownership against concurrent outfit changes/deletion until commit.
  perform 1 from public.outfits where id = p_outfit_id and user_id = v_user for share;
  if not found then raise exception 'Outfit not found' using errcode = '42501'; end if;

  insert into public.outfit_interactions (user_id, outfit_id, event_type, idempotency_key, context_snapshot)
  values (v_user, p_outfit_id, p_event_type, p_idempotency_key, p_context_snapshot)
  on conflict (user_id, idempotency_key) do nothing returning id into v_id;
  if v_id is not null then return v_id; end if;

  -- A new statement snapshot observes a concurrent winner after the unique-key wait.
  select * into v_existing from public.outfit_interactions
    where user_id = v_user and idempotency_key = p_idempotency_key;
  if not found then raise exception 'Interaction retry required' using errcode = '40001'; end if;
  if v_existing.outfit_id is distinct from p_outfit_id
    or v_existing.event_type is distinct from p_event_type
    or v_existing.context_snapshot is distinct from p_context_snapshot then
    raise exception 'Idempotency key was used for a different interaction' using errcode = '22023';
  end if;
  return v_existing.id;
end;
$$;

revoke all on function public.record_outfit_interaction(uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_outfit_interaction(uuid, text, text, jsonb) to authenticated;
comment on table public.outfit_interactions is 'Behavioral ledger. Does not update style feedback or Fashion DNA. Context is untrusted caller metadata.';
comment on function public.record_outfit_interaction(uuid, text, text, jsonb) is 'Authenticated owner-only, idempotent behavioral recording; no style preference side effects.';

commit;
