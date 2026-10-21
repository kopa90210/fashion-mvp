-- Gate 2: private user media with legacy public-URL compatibility.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('private-wardrobe-media', 'private-wardrobe-media', false, 10485760,
  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.users(id) on delete cascade,
  bucket_id text not null default 'private-wardrobe-media' check (bucket_id = 'private-wardrobe-media'),
  object_path text not null check (object_path ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$'),
  kind text not null check (kind in ('wardrobe_item', 'wishlist_item', 'source_photo')),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text, width integer check (width > 0), height integer check (height > 0),
  status text not null default 'active' check (status in ('active', 'missing', 'failed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);
create index if not exists media_assets_owner_created_idx on public.media_assets (owner_id, created_at desc);
alter table public.media_assets enable row level security;
create policy "media_assets: owner select" on public.media_assets for select to authenticated using (owner_id = auth.uid());
create policy "media_assets: owner insert" on public.media_assets for insert to authenticated with check (owner_id = auth.uid());
create policy "media_assets: owner delete" on public.media_assets for delete to authenticated using (owner_id = auth.uid());

alter table public.wardrobe_items add column if not exists media_asset_id uuid references public.media_assets(id) on delete set null;
alter table public.wishlist_items add column if not exists media_asset_id uuid references public.media_assets(id) on delete set null;
create index if not exists wardrobe_items_media_asset_idx on public.wardrobe_items (media_asset_id) where media_asset_id is not null;
create index if not exists wishlist_items_media_asset_idx on public.wishlist_items (media_asset_id) where media_asset_id is not null;

drop policy if exists "private media: owner read" on storage.objects;
create policy "private media: owner read" on storage.objects for select to authenticated
using (bucket_id = 'private-wardrobe-media' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
