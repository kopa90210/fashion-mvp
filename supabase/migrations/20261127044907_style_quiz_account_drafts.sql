create table public.style_quiz_drafts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 draft jsonb not null check(jsonb_typeof(draft)='object' and octet_length(draft::text)<=3000),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now()
);
alter table public.style_quiz_drafts enable row level security;
revoke all on public.style_quiz_drafts from public,anon,authenticated;
grant select,insert,update,delete on public.style_quiz_drafts to authenticated;
create policy quiz_draft_select on public.style_quiz_drafts for select to authenticated using ((select auth.uid())=user_id);
create policy quiz_draft_insert on public.style_quiz_drafts for insert to authenticated with check ((select auth.uid())=user_id);
create policy quiz_draft_update on public.style_quiz_drafts for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy quiz_draft_delete on public.style_quiz_drafts for delete to authenticated using ((select auth.uid())=user_id);
