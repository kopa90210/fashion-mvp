-- BE-2: deterministic one-piece swaps create immutable child outfits.
begin;

alter table public.outfits
  add column parent_outfit_id uuid references public.outfits(id) on delete set null;

create index outfits_parent_outfit_idx on public.outfits (parent_outfit_id)
  where parent_outfit_id is not null;

alter table public.outfits drop constraint outfits_source_check;
alter table public.outfits add constraint outfits_source_check
  check (source in ('engine', 'daily_ai', 'daily_fallback', 'manual', 'swap')) not valid;
alter table public.outfits validate constraint outfits_source_check;

alter table public.outfit_interactions drop constraint outfit_interactions_event_type_check;
alter table public.outfit_interactions add constraint outfit_interactions_event_type_check
  check (event_type in ('outfit_viewed', 'outfit_worn', 'outfit_not_today', 'item_swapped')) not valid;
alter table public.outfit_interactions validate constraint outfit_interactions_event_type_check;
alter table public.outfit_interactions add constraint outfit_interactions_swap_items_check
  check (
    (event_type = 'item_swapped' and item_id is not null and replacement_item_id is not null and item_id <> replacement_item_id)
    or (event_type <> 'item_swapped' and item_id is null and replacement_item_id is null)
  ) not valid;
alter table public.outfit_interactions validate constraint outfit_interactions_swap_items_check;

-- Mirrors the application's canonical category/role normalization for the
-- database boundary. It is private to database-owned functions.
create function public.wardrobe_item_slot(
  p_category text,
  p_subcategory text,
  p_display_name text,
  p_layer_role text
)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  with normalized as (
    select
      lower(btrim(coalesce(p_category, ''))) as category,
      lower(btrim(coalesce(p_layer_role, ''))) as role,
      lower(concat_ws(' ', p_subcategory, p_display_name, p_layer_role)) as item_text
  )
  select case category
    when 'top' then 'base_layer'
    when 'bottom' then 'bottom'
    when 'footwear' then 'footwear'
    when 'outerwear' then 'outerwear'
    when 'accessory' then 'accessory'
    else case
      when item_text like any (array['%shoe%', '%footwear%', '%sneaker%', '%boot%', '%loafer%']) then 'footwear'
      when item_text like any (array['%outerwear%', '%outer wear%', '%outer_layer%', '%outer layer%', '%jacket%', '%coat%', '%blazer%']) then 'outerwear'
      when item_text like any (array['%bottom%', '%pant%', '%trouser%', '%skirt%', '%jean%', '%short%']) then 'bottom'
      when item_text like any (array['%top%', '%shirt%', '%blouse%', '%tee%', '%sweater%']) then 'base_layer'
      when role in ('base_layer', 'base', 'top') then 'base_layer'
      when role = 'bottom' then 'bottom'
      when role in ('footwear', 'shoe') then 'footwear'
      when role in ('outerwear', 'outer_layer') then 'outerwear'
      when role = 'accessory' then 'accessory'
      else 'accessory'
    end
  end
  from normalized
$$;

revoke all on function public.wardrobe_item_slot(text, text, text, text)
  from public, anon, authenticated, service_role;

create function public.create_swapped_outfit(
  p_parent_outfit_id uuid,
  p_replaced_item_id uuid,
  p_replacement_item_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user uuid := auth.uid();
  v_context jsonb := jsonb_build_object('parent_outfit_id', p_parent_outfit_id);
  v_existing record;
  v_parent record;
  v_member record;
  v_replacement record;
  v_child_id uuid;
  v_item_ids uuid[] := array[]::uuid[];
  v_new_item_ids uuid[] := array[]::uuid[];
  v_slots text[] := array[]::text[];
  v_member_count integer := 0;
  v_replaced_found boolean := false;
  v_resolved_slot text;
  v_replaced_slot text;
  v_position integer;
begin
  if v_user is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_parent_outfit_id is null or p_replaced_item_id is null or p_replacement_item_id is null
    or p_replaced_item_id = p_replacement_item_id then
    raise exception 'Invalid swap items' using errcode = '22023';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 1 and 200 or btrim(p_idempotency_key) = '' then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  -- Serialize only identical retry namespaces, keeping the transaction short.
  perform pg_advisory_xact_lock(hashtextextended(v_user::text || ':' || p_idempotency_key, 0));

  select oi.outfit_id, oi.event_type, oi.item_id, oi.replacement_item_id,
         oi.context_snapshot, o.user_id, o.source
  into v_existing
  from public.outfit_interactions oi
  join public.outfits o on o.id = oi.outfit_id
  where oi.user_id = v_user and oi.idempotency_key = p_idempotency_key;
  if found then
    if v_existing.user_id is distinct from v_user
      or v_existing.source is distinct from 'swap'
      or v_existing.event_type is distinct from 'item_swapped'
      or v_existing.item_id is distinct from p_replaced_item_id
      or v_existing.replacement_item_id is distinct from p_replacement_item_id
      or v_existing.context_snapshot is distinct from v_context then
      raise exception 'Idempotency key was used for a different interaction' using errcode = '22023';
    end if;
    return v_existing.outfit_id;
  end if;

  select o.id, o.scheduled_for
  into v_parent
  from public.outfits o
  where o.id = p_parent_outfit_id and o.user_id = v_user
  for share;
  if not found then raise exception 'Outfit not found' using errcode = '42501'; end if;

  select array_agg(oi.wardrobe_item_id order by oi.position)
  into v_item_ids
  from public.outfit_items oi
  where oi.outfit_id = p_parent_outfit_id;
  if coalesce(cardinality(v_item_ids), 0) not between 3 and 5 then
    raise exception 'Parent outfit is structurally invalid' using errcode = '22023';
  end if;
  if p_replacement_item_id = any(v_item_ids) then
    raise exception 'Replacement is already in the outfit' using errcode = '22023';
  end if;

  -- Lock all involved ownership/item rows in UUID order before validation.
  perform 1
  from public.user_wardrobe_items uwi
  join public.wardrobe_items wi on wi.id = uwi.item_id
  where uwi.user_id = v_user
    and wi.id = any(array_append(v_item_ids, p_replacement_item_id))
  order by wi.id
  for share of uwi, wi;

  for v_member in
    select oi.wardrobe_item_id, oi.slot, oi.position,
           wi.category, wi.subcategory, wi.display_name, wi.layer_role,
           wi.status, uwi.retired_at
    from public.outfit_items oi
    join public.wardrobe_items wi on wi.id = oi.wardrobe_item_id
    left join public.user_wardrobe_items uwi
      on uwi.item_id = wi.id and uwi.user_id = v_user
    where oi.outfit_id = p_parent_outfit_id
    order by oi.position
  loop
    v_member_count := v_member_count + 1;
    if v_member.retired_at is not null or v_member.status is distinct from 'confirmed' then
      raise exception 'Parent outfit contains unavailable wardrobe items' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.user_wardrobe_items uwi
      where uwi.user_id = v_user and uwi.item_id = v_member.wardrobe_item_id and uwi.retired_at is null
    ) then
      raise exception 'Parent outfit contains unavailable wardrobe items' using errcode = '22023';
    end if;
    v_resolved_slot := public.wardrobe_item_slot(v_member.category, v_member.subcategory, v_member.display_name, v_member.layer_role);
    if v_resolved_slot is distinct from v_member.slot then
      raise exception 'Parent outfit item has an invalid role' using errcode = '22023';
    end if;
    v_slots := array_append(v_slots, v_member.slot);
    if v_member.wardrobe_item_id = p_replaced_item_id then
      v_replaced_found := true;
      v_replaced_slot := v_member.slot;
      v_new_item_ids := array_append(v_new_item_ids, p_replacement_item_id);
    else
      v_new_item_ids := array_append(v_new_item_ids, v_member.wardrobe_item_id);
    end if;
  end loop;

  if v_member_count <> cardinality(v_item_ids) then
    raise exception 'Parent outfit contains unavailable wardrobe items' using errcode = '22023';
  end if;
  if not v_replaced_found then raise exception 'Replaced item is not part of outfit' using errcode = '22023'; end if;
  if not ('base_layer' = any(v_slots) and 'bottom' = any(v_slots) and 'footwear' = any(v_slots))
    or cardinality(v_slots) <> cardinality(array(select distinct unnest(v_slots))) then
    raise exception 'Resulting outfit is structurally invalid' using errcode = '22023';
  end if;

  select wi.id, wi.category, wi.subcategory, wi.display_name, wi.layer_role
  into v_replacement
  from public.user_wardrobe_items uwi
  join public.wardrobe_items wi on wi.id = uwi.item_id
  where uwi.user_id = v_user and uwi.item_id = p_replacement_item_id
    and uwi.retired_at is null and wi.status = 'confirmed';
  if not found then raise exception 'Replacement is not in the active confirmed wardrobe' using errcode = '22023'; end if;
  v_resolved_slot := public.wardrobe_item_slot(v_replacement.category, v_replacement.subcategory, v_replacement.display_name, v_replacement.layer_role);
  if v_resolved_slot is distinct from v_replaced_slot then
    raise exception 'Replacement has a different role' using errcode = '22023';
  end if;

  insert into public.outfits (
    user_id, item_ids, source, scheduled_for, status, generator_version,
    context_snapshot, fashion_dna_updated_at, parent_outfit_id
  ) values (
    v_user, to_jsonb(v_new_item_ids), 'swap', v_parent.scheduled_for, 'generated',
    'deterministic-swap-v1', v_context,
    (select fd.updated_at from public.fashion_dna fd where fd.user_id = v_user),
    p_parent_outfit_id
  ) returning id into v_child_id;

  for v_position in 1..cardinality(v_new_item_ids) loop
    insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position)
    values (v_child_id, v_new_item_ids[v_position], v_slots[v_position], v_position - 1);
  end loop;

  insert into public.outfit_interactions (
    user_id, outfit_id, event_type, item_id, replacement_item_id,
    context_snapshot, idempotency_key
  ) values (
    v_user, v_child_id, 'item_swapped', p_replaced_item_id,
    p_replacement_item_id, v_context, p_idempotency_key
  );

  return v_child_id;
end;
$$;

revoke all on function public.create_swapped_outfit(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_swapped_outfit(uuid, uuid, uuid, text)
  to authenticated;

comment on column public.outfits.parent_outfit_id is 'Immutable provenance link for derived outfits such as one-piece swaps.';
comment on function public.create_swapped_outfit(uuid, uuid, uuid, text) is 'Creates one immutable swap child, relational membership, and item_swapped interaction atomically.';

commit;
