-- Gate 2 follow-up: least-privilege grants and cached auth checks.
-- The base media schema was manually applied and reconciled as 20260916160000.

begin;

alter table public.media_assets enable row level security;

-- Supabase default table grants are broader than this feature requires.
revoke all privileges on table public.media_assets from public, anon, authenticated;
grant select, insert, delete on table public.media_assets to authenticated;
grant all privileges on table public.media_assets to service_role;

drop policy if exists "media_assets: owner select" on public.media_assets;
drop policy if exists "media_assets: owner insert" on public.media_assets;
drop policy if exists "media_assets: owner delete" on public.media_assets;

create policy "media_assets: owner select"
  on public.media_assets for select
  to authenticated
  using (owner_id = (select auth.uid()));

create policy "media_assets: owner insert"
  on public.media_assets for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

create policy "media_assets: owner delete"
  on public.media_assets for delete
  to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists "private media: owner read" on storage.objects;

create policy "private media: owner read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'private-wardrobe-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create or replace function public.attach_media_asset_to_wardrobe_item(
  p_item_id uuid,
  p_media_asset_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_bucket_id text;
  v_object_path text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.user_wardrobe_items uwi
    join public.wardrobe_items wi on wi.id = uwi.item_id
    where uwi.user_id = v_user_id
      and wi.id = p_item_id
      and wi.source = 'user_upload'
  ) then
    raise exception 'Wardrobe item not found or not owned by caller' using errcode = '42501';
  end if;

  select bucket_id, object_path
  into v_bucket_id, v_object_path
  from public.media_assets
  where id = p_media_asset_id
    and owner_id = v_user_id
    and kind = 'wardrobe_item'
    and status = 'active';

  if v_object_path is null then
    raise exception 'Media asset not found or not owned by caller' using errcode = '42501';
  end if;

  update public.wardrobe_items
  set media_asset_id = p_media_asset_id,
      image_url = 'private://' || v_bucket_id || '/' || v_object_path
  where id = p_item_id;
end;
$$;

revoke all on function public.attach_media_asset_to_wardrobe_item(uuid, uuid)
  from public, anon;
grant execute on function public.attach_media_asset_to_wardrobe_item(uuid, uuid)
  to authenticated, service_role;

commit;
