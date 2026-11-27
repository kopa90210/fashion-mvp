create table public.stylist_shopping_preferences (
 user_id uuid primary key references auth.users(id) on delete cascade,
 collection text not null check(collection in ('masculine','feminine')),
 budget integer not null check(budget between 1 and 100000),
 top_size text not null default '' check(length(top_size)<=12),
 bottom_size text not null default '' check(length(bottom_size)<=12),
 shoe_size text not null default '' check(length(shoe_size)<=12),
 updated_at timestamptz not null default now()
);
alter table public.stylist_shopping_preferences enable row level security;
revoke all on public.stylist_shopping_preferences from public, anon, authenticated;
grant select,insert,update,delete on public.stylist_shopping_preferences to authenticated;
create policy preferences_select on public.stylist_shopping_preferences for select to authenticated using ((select auth.uid())=user_id);
create policy preferences_insert on public.stylist_shopping_preferences for insert to authenticated with check ((select auth.uid())=user_id);
create policy preferences_update on public.stylist_shopping_preferences for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy preferences_delete on public.stylist_shopping_preferences for delete to authenticated using ((select auth.uid())=user_id);
