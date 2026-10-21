-- C5.5: separate style-learning seeds from owned wardrobe membership.
-- LOCAL-ONLY checkpoint until historical remote membership provenance is audited.
--
-- Domain invariant after this migration:
--   user_wardrobe_items   = clothes the user owns
--   user_style_seed_items = curated items selected for style learning/calibration
--
-- Do not push this migration to remote Supabase as part of the local MVP checkpoint.

begin;

create table if not exists public.user_style_seed_items (
  user_id uuid not null references public.users(id) on delete cascade,
  item_id uuid not null references public.wardrobe_items(id) on delete cascade,
  selected_at timestamptz not null default now(),
  retired_at timestamptz,
  primary key (user_id, item_id)
);

comment on table public.user_style_seed_items is
  'Curated catalog preferences selected for calibration/style learning. This table does not represent physical ownership.';

comment on table public.user_wardrobe_items is
  'Authoritative user-to-item ownership relation. Style-learning preferences belong in user_style_seed_items.';

create index if not exists user_style_seed_items_item_user_idx
  on public.user_style_seed_items (item_id, user_id);

alter table public.user_style_seed_items enable row level security;

revoke all on table public.user_style_seed_items from public, anon, authenticated;
grant select, insert, update, delete on table public.user_style_seed_items to authenticated;
grant all on table public.user_style_seed_items to service_role;

drop policy if exists "user_style_seed_items: owner select" on public.user_style_seed_items;
drop policy if exists "user_style_seed_items: owner insert curated" on public.user_style_seed_items;
drop policy if exists "user_style_seed_items: owner update" on public.user_style_seed_items;
drop policy if exists "user_style_seed_items: owner delete" on public.user_style_seed_items;

create policy "user_style_seed_items: owner select"
  on public.user_style_seed_items for select to authenticated
  using (user_id = (select auth.uid()));

create policy "user_style_seed_items: owner insert curated"
  on public.user_style_seed_items for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.wardrobe_items wi
      where wi.id = user_style_seed_items.item_id
        and wi.source = 'curated'
    )
  );

create policy "user_style_seed_items: owner update"
  on public.user_style_seed_items for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.wardrobe_items wi
      where wi.id = user_style_seed_items.item_id
        and wi.source = 'curated'
    )
  );

create policy "user_style_seed_items: owner delete"
  on public.user_style_seed_items for delete to authenticated
  using (user_id = (select auth.uid()));

-- Existing local curated memberships were created by the onboarding selection
-- flow. Move them into the preference relation before removing them from the
-- ownership relation. This backfill is intentionally local-only.
insert into public.user_style_seed_items (user_id, item_id, selected_at, retired_at)
select uwi.user_id, uwi.item_id, uwi.added_at, uwi.retired_at
from public.user_wardrobe_items uwi
join public.wardrobe_items wi on wi.id = uwi.item_id
where wi.source = 'curated'
on conflict (user_id, item_id) do update
set selected_at = least(public.user_style_seed_items.selected_at, excluded.selected_at),
    retired_at = excluded.retired_at;

delete from public.user_wardrobe_items uwi
using public.wardrobe_items wi
where wi.id = uwi.item_id
  and wi.source = 'curated';

-- End-user clients no longer create/remove ownership rows directly.
-- Owned rows are created/removed by the existing trusted wardrobe RPCs.
drop policy if exists "user_wardrobe_items: owner insert curated" on public.user_wardrobe_items;
drop policy if exists "user_wardrobe_items: owner delete curated" on public.user_wardrobe_items;
revoke insert, delete on table public.user_wardrobe_items from anon, authenticated;

-- Persist calibration outfits distinctly from personal/daily outfits.
alter table public.outfits
  drop constraint if exists outfits_source_check;

alter table public.outfits
  add constraint outfits_source_check
  check (source in ('engine', 'daily_ai', 'daily_fallback', 'manual', 'swap', 'calibration')) not valid;

alter table public.outfits
  validate constraint outfits_source_check;

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
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_context_snapshot, '{}'::jsonb)) <> 'object' then
    raise exception 'Context snapshot must be an object' using errcode = '22023';
  end if;

  if cardinality(p_item_ids) not between 2 and 5
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
    'deterministic-calibration-v1',
    coalesce(p_context_snapshot, '{}'::jsonb),
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
end;
$$;

revoke all on function public.create_calibration_outfit_with_items(uuid[], jsonb, jsonb)
  from public, anon;
grant execute on function public.create_calibration_outfit_with_items(uuid[], jsonb, jsonb)
  to authenticated, service_role;

comment on function public.create_calibration_outfit_with_items(uuid[], jsonb, jsonb) is
  'Persists calibration outfits using active curated style-seed relationships only.';

commit;
