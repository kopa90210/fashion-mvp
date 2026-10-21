-- Wishlist items are user-owned desired pieces, separate from the wardrobe
-- catalog and ownership join.
create table if not exists public.wishlist_items (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.users on delete cascade not null,
  category     text check (category in ('top', 'bottom', 'outerwear', 'footwear', 'accessory')),
  subcategory  text,
  brand        text,
  display_name text,
  image_url    text not null,
  color        jsonb not null default '{}'::jsonb,
  fit          jsonb not null default '{}'::jsonb,
  style_tags   jsonb not null default '{}'::jsonb,
  layer_role   text,
  created_at   timestamptz default now() not null
);

create index if not exists wishlist_items_user_created_idx on public.wishlist_items (user_id, created_at desc);
create index if not exists wishlist_items_user_category_idx on public.wishlist_items (user_id, category);

alter table public.wishlist_items alter column category drop not null;
alter table public.wishlist_items enable row level security;
drop policy if exists "wishlist_items: owner all" on public.wishlist_items;
create policy "wishlist_items: owner all"
  on public.wishlist_items for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.wishlist_items to authenticated;