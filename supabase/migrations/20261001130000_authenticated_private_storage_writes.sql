-- Allow the authenticated server session to write only inside its own private
-- media folder. The application validates image bytes before making a request;
-- Storage additionally enforces the bucket MIME and size constraints.
begin;

drop policy if exists "private media: owner insert" on storage.objects;
create policy "private media: owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'private-wardrobe-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$'
);

drop policy if exists "private media: owner delete" on storage.objects;
create policy "private media: owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'private-wardrobe-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]+/[0-9a-f-]+\.(jpg|png|webp)$'
);

commit;
