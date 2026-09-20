-- Gate 1: Canonical wardrobe ownership and RLS hardening.
-- user_wardrobe_items is the sole end-user ownership/membership authority.

begin;

comment on column public.wardrobe_items.owner_id is
  'Deprecated compatibility field. user_wardrobe_items is the authoritative ownership relation.';

create index if not exists user_wardrobe_items_item_user_idx
  on public.user_wardrobe_items (item_id, user_id);

drop policy if exists "wardrobe_items: authenticated select" on public.wardrobe_items;
drop policy if exists "wardrobe_items: select curated or own" on public.wardrobe_items;
drop policy if exists "wardrobe_items: authenticated insert user_upload" on public.wardrobe_items;
drop policy if exists "wardrobe_items: insert user_upload" on public.wardrobe_items;
drop policy if exists "wardrobe_items: owner structured update" on public.wardrobe_items;
drop policy if exists "wardrobe_items: owner update" on public.wardrobe_items;
drop policy if exists "wardrobe_items: owner delete" on public.wardrobe_items;
drop policy if exists "wardrobe_items: owner insert" on public.wardrobe_items;

create policy "wardrobe_items: select curated or member upload" on public.wardrobe_items for select to authenticated
  using (source = 'curated' or (source = 'user_upload' and exists (
    select 1 from public.user_wardrobe_items uwi where uwi.item_id = wardrobe_items.id and uwi.user_id = auth.uid()
  )));

create policy "wardrobe_items: member updates user upload" on public.wardrobe_items for update to authenticated
  using (source = 'user_upload' and exists (
    select 1 from public.user_wardrobe_items uwi where uwi.item_id = wardrobe_items.id and uwi.user_id = auth.uid()
  ))
  with check (source = 'user_upload' and exists (
    select 1 from public.user_wardrobe_items uwi where uwi.item_id = wardrobe_items.id and uwi.user_id = auth.uid()
  ));

revoke insert, delete on public.wardrobe_items from public, anon, authenticated;
grant insert, delete on public.wardrobe_items to service_role;

drop policy if exists "user_wardrobe_items: owner all" on public.user_wardrobe_items;
drop policy if exists "user_wardrobe_items: owner select" on public.user_wardrobe_items;
drop policy if exists "user_wardrobe_items: owner insert curated" on public.user_wardrobe_items;
drop policy if exists "user_wardrobe_items: owner update" on public.user_wardrobe_items;
drop policy if exists "user_wardrobe_items: owner delete curated" on public.user_wardrobe_items;

create policy "user_wardrobe_items: owner select" on public.user_wardrobe_items for select to authenticated
  using (auth.uid() = user_id);
create policy "user_wardrobe_items: owner insert curated" on public.user_wardrobe_items for insert to authenticated
  with check (auth.uid() = user_id and exists (
    select 1 from public.wardrobe_items wi where wi.id = user_wardrobe_items.item_id and wi.source = 'curated'
  ));
create policy "user_wardrobe_items: owner update" on public.user_wardrobe_items for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_wardrobe_items: owner delete curated" on public.user_wardrobe_items for delete to authenticated
  using (auth.uid() = user_id and exists (
    select 1 from public.wardrobe_items wi where wi.id = user_wardrobe_items.item_id and wi.source = 'curated'
  ));

create or replace function public.create_draft_wardrobe_item(p_image_url text, p_source_photo_id uuid default null)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_user_id uuid; v_item_id uuid; v_photo_owner uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  if p_source_photo_id is not null then
    select user_id into v_photo_owner from public.source_photos where id = p_source_photo_id;
    if v_photo_owner is null or v_photo_owner <> v_user_id then
      raise exception 'Source photo not found or ownership mismatch' using errcode = '42501';
    end if;
  end if;
  insert into public.wardrobe_items (image_url, source, status, source_photo_id, processing_status, prettify_status)
  values (p_image_url, 'user_upload', 'draft', p_source_photo_id, 'detected', 'none') returning id into v_item_id;
  insert into public.user_wardrobe_items (user_id, item_id, quantity) values (v_user_id, v_item_id, 1);
  return v_item_id;
end;
$$;
revoke all on function public.create_draft_wardrobe_item(text, uuid) from public, anon;
grant execute on function public.create_draft_wardrobe_item(text, uuid) to authenticated, service_role;

create or replace function public.remove_user_wardrobe_item(p_item_id uuid)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_user_id uuid := auth.uid(); v_source text;
begin
  if v_user_id is null then raise exception 'Not authenticated' using errcode = '42501'; end if;
  select wi.source into v_source from public.wardrobe_items wi join public.user_wardrobe_items uwi on uwi.item_id = wi.id
  where wi.id = p_item_id and uwi.user_id = v_user_id for update of wi;
  if v_source is null then raise exception 'Wardrobe item not found or not owned by caller' using errcode = '42501'; end if;
  if v_source = 'user_upload' then delete from public.wardrobe_items where id = p_item_id;
  else delete from public.user_wardrobe_items where user_id = v_user_id and item_id = p_item_id; end if;
end;
$$;
revoke all on function public.remove_user_wardrobe_item(uuid) from public, anon;
grant execute on function public.remove_user_wardrobe_item(uuid) to authenticated, service_role;

alter function public.handle_new_user() set search_path = pg_catalog;
alter function public.transition_wardrobe_item_processing_state(uuid, text, uuid) set search_path = pg_catalog;
alter function public.transition_wardrobe_item_prettify_state(uuid, text, uuid) set search_path = pg_catalog;
alter function public.guard_wardrobe_item_pipeline_transitions() set search_path = pg_catalog;

commit;
