-- Gate 4 SQL Regression Test: Signature Look Write Safety & Monotonic Revision Hardening
-- Verifies:
-- 1. Direct INSERT, UPDATE, DELETE on user_signature_looks are rejected for authenticated role.
-- 2. Authenticated role can only SELECT their own row.
-- 3. Monotonic revision preserved across unpin (pin A -> unpin -> pin B -> retry old request rejected).
-- 4. Old request retry cannot recreate removed pin after unpin.
-- 5. Foreign key ON DELETE SET NULL clears outfit_id without deleting version record.

begin;

create or replace function pg_temp.assert_true(cond boolean, msg text) returns void as $$
begin
  if not cond then
    raise exception 'Assertion failed: %', msg;
  end if;
end;
$$ language plpgsql;

create or replace function pg_temp.expect_error(sql_cmd text, expected_errcode text, msg text) returns void as $$
declare
  err_occurred boolean := false;
  actual_errcode text;
begin
  begin
    execute sql_cmd;
  exception when others then
    err_occurred := true;
    actual_errcode := SQLSTATE;
    if actual_errcode <> expected_errcode then
      raise exception 'Expected error % but got % for: %', expected_errcode, actual_errcode, msg;
    end if;
  end;
  if not err_occurred then
    raise exception 'Expected error % but no error occurred for: %', expected_errcode, msg;
  end if;
end;
$$ language plpgsql;

-- Setup test users
insert into auth.users (id, email)
values
  ('f1000000-0000-0000-0000-000000000001', 'user1_g4@example.com'),
  ('f1000000-0000-0000-0000-000000000002', 'user2_g4@example.com')
on conflict (id) do nothing;

insert into public.users (id, timezone)
values
  ('f1000000-0000-0000-0000-000000000001', 'America/New_York'),
  ('f1000000-0000-0000-0000-000000000002', 'Europe/London')
on conflict (id) do nothing;

-- Setup test wardrobe items
insert into public.wardrobe_items (id, category, subcategory, display_name, status, image_url)
values
  ('f1000000-0000-0000-0000-000000000101', 'top', 'shirt', 'White Oxford Shirt', 'confirmed', 'https://media.local/shirt.png'),
  ('f1000000-0000-0000-0000-000000000102', 'bottom', 'pants', 'Navy Chinos', 'confirmed', 'https://media.local/pants.png')
on conflict (id) do nothing;

insert into public.user_wardrobe_items (user_id, item_id)
values
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000101'),
  ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000102')
on conflict (user_id, item_id) do nothing;

-- Setup test outfits for user 1
insert into public.outfits (id, user_id, source, status, scheduled_for)
values
  ('f1000000-0000-0000-0000-000000000011', 'f1000000-0000-0000-0000-000000000001', 'daily_ai', 'generated', '2026-10-27'),
  ('f1000000-0000-0000-0000-000000000012', 'f1000000-0000-0000-0000-000000000001', 'engine', 'superseded', '2026-10-26')
on conflict (id) do nothing;

insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position)
values
  ('f1000000-0000-0000-0000-000000000011', 'f1000000-0000-0000-0000-000000000101', 'base_layer', 0),
  ('f1000000-0000-0000-0000-000000000012', 'f1000000-0000-0000-0000-000000000102', 'bottom', 0)
on conflict (outfit_id, position) do nothing;

-- Make outfit 11 Saved and outfit 12 Worn
insert into public.saved_outfits (user_id, outfit_id)
values ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000011')
on conflict (user_id, outfit_id) do nothing;

insert into public.outfit_wear_records (user_id, outfit_id, worn_on)
values ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000012', '2026-10-27')
on conflict (user_id, outfit_id, worn_on) do nothing;

-- ---------------------------------------------------------------------------
-- Test 1: Direct Mutations are REJECTED for Authenticated Users
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" to 'f1000000-0000-0000-0000-000000000001';

-- Direct INSERT must be rejected (42501 permission denied)
select pg_temp.expect_error(
  $$insert into public.user_signature_looks (user_id, outfit_id, version) values ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000011', 99)$$,
  '42501',
  'Direct INSERT on user_signature_looks must fail with permission denied'
);

-- Direct UPDATE must be rejected
select pg_temp.expect_error(
  $$update public.user_signature_looks set version = 99 where user_id = 'f1000000-0000-0000-0000-000000000001'$$,
  '42501',
  'Direct UPDATE on user_signature_looks must fail with permission denied'
);

-- Direct DELETE must be rejected
select pg_temp.expect_error(
  $$delete from public.user_signature_looks where user_id = 'f1000000-0000-0000-0000-000000000001'$$,
  '42501',
  'Direct DELETE on user_signature_looks must fail with permission denied'
);

-- ---------------------------------------------------------------------------
-- Test 2: Pin A -> Unpin -> Pin B -> Retry Old Requests
-- ---------------------------------------------------------------------------

-- Step 2a: Pin Outfit A (expected_version = 0 or null)
select public.set_signature_look('f1000000-0000-0000-0000-000000000011', null);

select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks
   where user_id = 'f1000000-0000-0000-0000-000000000001'
     and outfit_id = 'f1000000-0000-0000-0000-000000000011'
     and version = 1),
  'Outfit A is pinned at version 1'
);

-- Step 2b: Unpin Outfit A with expected_version = 1
select public.clear_signature_look(1);

-- Verify visible pin is removed (outfit_id is NULL), but monotonic version is incremented to 2!
select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks
   where user_id = 'f1000000-0000-0000-0000-000000000001'
     and outfit_id is null
     and version = 2),
  'Unpin sets outfit_id to NULL and increments version to 2'
);

-- Step 2c: Retry old Pin A request (which had expected_version = 0) while unpinned
-- MUST BE REJECTED (40900 conflict) and must NOT recreate removed pin A!
select pg_temp.expect_error(
  $$select public.set_signature_look('f1000000-0000-0000-0000-000000000011', 0)$$,
  '40900',
  'Retried Pin A with expected_version=0 must fail with version conflict 40900'
);

select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks
   where user_id = 'f1000000-0000-0000-0000-000000000001'
     and outfit_id is null
     and version = 2),
  'Stale retry did not recreate removed pin'
);

-- Step 2d: Pin Outfit B with expected_version = 2
select public.set_signature_look('f1000000-0000-0000-0000-000000000012', 2);

select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks
   where user_id = 'f1000000-0000-0000-0000-000000000001'
     and outfit_id = 'f1000000-0000-0000-0000-000000000012'
     and version = 3),
  'Outfit B is pinned at version 3'
);

-- Step 2e: Retry old Pin A request (with expected_version = 0 or 1)
-- MUST BE REJECTED (40900 conflict) and must NOT overwrite outfit B!
select pg_temp.expect_error(
  $$select public.set_signature_look('f1000000-0000-0000-0000-000000000011', 0)$$,
  '40900',
  'Stale Pin A request with expected_version=0 must be rejected'
);

select pg_temp.expect_error(
  $$select public.set_signature_look('f1000000-0000-0000-0000-000000000011', 1)$$,
  '40900',
  'Stale Pin A request with expected_version=1 must be rejected'
);

-- Step 2f: Retry old Unpin request (which had expected_version = 1)
-- MUST BE REJECTED (40900 conflict) and must NOT unpin outfit B!
select pg_temp.expect_error(
  $$select public.clear_signature_look(1)$$,
  '40900',
  'Stale Unpin request with expected_version=1 must be rejected'
);

-- Verify Outfit B remains pinned at version 3
select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks
   where user_id = 'f1000000-0000-0000-0000-000000000001'
     and outfit_id = 'f1000000-0000-0000-0000-000000000012'
     and version = 3),
  'Outfit B remains safely pinned despite multiple stale retries'
);

-- ---------------------------------------------------------------------------
-- Test 3: Foreign Key ON DELETE SET NULL Preserves Concurrency Counter
-- ---------------------------------------------------------------------------
reset role;

-- Delete outfit 12 from public.outfits
delete from public.outfits where id = 'f1000000-0000-0000-0000-000000000012';

-- outfit_id in user_signature_looks must become NULL, but row and version=3 must survive!
select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks
   where user_id = 'f1000000-0000-0000-0000-000000000001'
     and outfit_id is null
     and version = 3),
  'Outfit deletion sets outfit_id to NULL while preserving version counter'
);

-- ---------------------------------------------------------------------------
-- Test 4: RLS Cross-User SELECT Isolation
-- ---------------------------------------------------------------------------
set local role authenticated;
set local "request.jwt.claim.sub" to 'f1000000-0000-0000-0000-000000000002';

-- User 2 cannot see User 1's signature row
select pg_temp.assert_true(
  (select count(*) = 0 from public.user_signature_looks
   where user_id = 'f1000000-0000-0000-0000-000000000001'),
  'User 2 cannot see User 1 signature row'
);

rollback;
