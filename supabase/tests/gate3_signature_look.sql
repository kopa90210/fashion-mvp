-- Gate 3: Signature Look Database Tests
-- Execute only on local disposable Supabase. Rolled back at end of test.

begin;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'FAIL: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$
declare
  v_code text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
    if v_code <> p_code then
      raise exception 'FAIL: expected error code %, got %', p_code, v_code;
    end if;
    return;
  end;
  raise exception 'FAIL: expected error %, but statement succeeded', p_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setup Fixtures
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('e1000000-0000-0000-0000-000000000001', 'e1-user-a@local.test'),
  ('e1000000-0000-0000-0000-000000000002', 'e1-user-b@local.test')
on conflict (id) do nothing;

insert into public.users (id, timezone) values
  ('e1000000-0000-0000-0000-000000000001', 'America/New_York'),
  ('e1000000-0000-0000-0000-000000000002', 'Europe/London')
on conflict (id) do update set timezone = excluded.timezone;

-- User A Outfits
insert into public.outfits (id, user_id, source, status, scheduled_for, styling_tip) values
  ('e1000000-0000-0000-0000-000000000011', 'e1000000-0000-0000-0000-000000000001', 'daily_ai', 'generated', '2026-10-27', 'Sharp daily look'),
  ('e1000000-0000-0000-0000-000000000012', 'e1000000-0000-0000-0000-000000000001', 'engine', 'superseded', '2026-10-26', 'Classic evening look'),
  ('e1000000-0000-0000-0000-000000000013', 'e1000000-0000-0000-0000-000000000001', 'daily_ai', 'generated', '2026-10-25', 'Relaxed weekend look'),
  ('e1000000-0000-0000-0000-000000000014', 'e1000000-0000-0000-0000-000000000001', 'calibration', 'generated', null, 'Calibration look'),
  ('e1000000-0000-0000-0000-000000000015', 'e1000000-0000-0000-0000-000000000001', 'daily_ai', 'invalid', '2026-10-24', 'Invalid look')
on conflict (id) do nothing;

-- User B Outfit
insert into public.outfits (id, user_id, source, status, scheduled_for) values
  ('e1000000-0000-0000-0000-000000000021', 'e1000000-0000-0000-0000-000000000002', 'daily_ai', 'generated', '2026-10-27')
on conflict (id) do nothing;

-- Garments for User A
insert into public.wardrobe_items (id, category, subcategory, display_name, image_url, layer_role, source, status) values
  ('e2000000-0000-0000-0000-000000000001', 'top', 'blazer', 'Navy Wool Blazer', 'https://test/blazer.jpg', 'outerwear', 'user_upload', 'confirmed'),
  ('e2000000-0000-0000-0000-000000000002', 'bottom', 'trousers', 'Grey Wool Trousers', 'https://test/trousers.jpg', 'bottom', 'user_upload', 'confirmed')
on conflict (id) do nothing;

insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position) values
  ('e1000000-0000-0000-0000-000000000011', 'e2000000-0000-0000-0000-000000000001', 'outerwear', 0),
  ('e1000000-0000-0000-0000-000000000011', 'e2000000-0000-0000-0000-000000000002', 'bottom', 1)
on conflict do nothing;

-- User A saves Outfit 11
insert into public.saved_outfits (user_id, outfit_id, garment_snapshot)
values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000011', '[]'::jsonb)
on conflict (user_id, outfit_id) do nothing;

-- User A wears Outfit 12
insert into public.outfit_wear_records (user_id, outfit_id, worn_on, garment_snapshot)
values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000012', '2026-10-26', '[]'::jsonb)
on conflict (user_id, outfit_id, worn_on) do nothing;

-- ---------------------------------------------------------------------------
-- Authenticate as User A
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Test 1: Pin Eligible Outfit from Saved Collection
-- ---------------------------------------------------------------------------

select public.set_signature_look('e1000000-0000-0000-0000-000000000011');

select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks where user_id = 'e1000000-0000-0000-0000-000000000001'),
  'User A has exactly 1 signature look row'
);

select pg_temp.assert_true(
  (select outfit_id = 'e1000000-0000-0000-0000-000000000011' and version = 1 from public.user_signature_looks where user_id = 'e1000000-0000-0000-0000-000000000001'),
  'Signature look outfit ID is 11 with version 1'
);

select pg_temp.assert_true(
  (select jsonb_array_length(garment_snapshot) = 2 from public.user_signature_looks where user_id = 'e1000000-0000-0000-0000-000000000001'),
  'Signature look captured 2-garment snapshot'
);

-- ---------------------------------------------------------------------------
-- Test 2: Duplicate Pin is Idempotent
-- ---------------------------------------------------------------------------

select pg_temp.assert_true(
  (select (public.set_signature_look('e1000000-0000-0000-0000-000000000011')->>'replayed')::boolean),
  'Repeated pin of same outfit returns replayed: true'
);

-- ---------------------------------------------------------------------------
-- Test 3: Historical Snapshot Survives Garment Deletion
-- ---------------------------------------------------------------------------

reset role;
delete from public.wardrobe_items where id = 'e2000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);

select pg_temp.assert_true(
  (select jsonb_array_length(garment_snapshot) = 2 from public.user_signature_looks where user_id = 'e1000000-0000-0000-0000-000000000001'),
  'Historical garment snapshot in user_signature_looks preserved all 2 garments despite cascade deletion'
);

-- ---------------------------------------------------------------------------
-- Test 4: Pin Remains when Outfit is subsequently Unsaved
-- ---------------------------------------------------------------------------

delete from public.saved_outfits where user_id = 'e1000000-0000-0000-0000-000000000001' and outfit_id = 'e1000000-0000-0000-0000-000000000011';

select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks where user_id = 'e1000000-0000-0000-0000-000000000001' and outfit_id = 'e1000000-0000-0000-0000-000000000011'),
  'Signature look pin remains after unsaving the outfit from Saved collection'
);

-- ---------------------------------------------------------------------------
-- Test 5: Replace Signature Look with Outfit from Worn Collection
-- ---------------------------------------------------------------------------

select public.set_signature_look('e1000000-0000-0000-0000-000000000012');

select pg_temp.assert_true(
  (select outfit_id = 'e1000000-0000-0000-0000-000000000012' and version = 2 from public.user_signature_looks where user_id = 'e1000000-0000-0000-0000-000000000001'),
  'Signature look replaced with Outfit 12 and version incremented to 2'
);

-- ---------------------------------------------------------------------------
-- Test 6: Pin Remains when Wear Record is Undone
-- ---------------------------------------------------------------------------

delete from public.outfit_wear_records where user_id = 'e1000000-0000-0000-0000-000000000001' and outfit_id = 'e1000000-0000-0000-0000-000000000012';

select pg_temp.assert_true(
  (select count(*) = 1 from public.user_signature_looks where user_id = 'e1000000-0000-0000-0000-000000000001' and outfit_id = 'e1000000-0000-0000-0000-000000000012'),
  'Signature look pin remains after undoing wear record'
);

-- ---------------------------------------------------------------------------
-- Test 7: Eligibility Rejections
-- ---------------------------------------------------------------------------

-- 7a: Outfit not in Saved or Worn (Outfit 13 exists in outfits but was neither saved nor worn)
select pg_temp.expect_error(
  $$select public.set_signature_look('e1000000-0000-0000-0000-000000000013')$$,
  '42501'
);

-- 7b: Calibration outfit rejected
reset role;
insert into public.saved_outfits (user_id, outfit_id) values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000014') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);

select pg_temp.expect_error(
  $$select public.set_signature_look('e1000000-0000-0000-0000-000000000014')$$,
  '42501'
);

-- 7c: Invalid outfit rejected
reset role;
insert into public.saved_outfits (user_id, outfit_id) values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000015') on conflict do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000001', true);

select pg_temp.expect_error(
  $$select public.set_signature_look('e1000000-0000-0000-0000-000000000015')$$,
  '42501'
);

-- 7d: Cross-user outfit rejected (User B's outfit)
select pg_temp.expect_error(
  $$select public.set_signature_look('e1000000-0000-0000-0000-000000000021')$$,
  '42501'
);

-- ---------------------------------------------------------------------------
-- Test 8: Version Conflict (Stale Expected Version)
-- ---------------------------------------------------------------------------

-- Save Outfit 11 again so it is eligible
insert into public.saved_outfits (user_id, outfit_id) values ('e1000000-0000-0000-0000-000000000001', 'e1000000-0000-0000-0000-000000000011')
on conflict do nothing;

-- Current version is 2; passing expected version 1 should fail with 40900
select pg_temp.expect_error(
  $$select public.set_signature_look('e1000000-0000-0000-0000-000000000011', 1)$$,
  '40900'
);

-- ---------------------------------------------------------------------------
-- Test 9: Unpin (clear_signature_look)
-- ---------------------------------------------------------------------------

select public.clear_signature_look(2);

select pg_temp.assert_true(
  (select count(*) = 1 and bool_and(outfit_id is null) from public.user_signature_looks where user_id = 'e1000000-0000-0000-0000-000000000001'),
  'Signature look unpinned with monotonic revision preserved'
);

-- Idempotent second clear
select pg_temp.assert_true(
  ((public.clear_signature_look()->>'success')::boolean),
  'Second clear is idempotent'
);

-- ---------------------------------------------------------------------------
-- Test 10: RLS Isolation
-- ---------------------------------------------------------------------------

-- User A pins Outfit 11 again
select public.set_signature_look('e1000000-0000-0000-0000-000000000011');

-- Switch to User B
select set_config('request.jwt.claim.sub', 'e1000000-0000-0000-0000-000000000002', true);

select pg_temp.assert_true(
  (select count(*) = 0 from public.user_signature_looks),
  'RLS: User B sees 0 signature looks'
);

-- ---------------------------------------------------------------------------
-- Test 11: Signed-out access rejected
-- ---------------------------------------------------------------------------

reset role;
set role anon;

select pg_temp.expect_error(
  $$select public.set_signature_look('e1000000-0000-0000-0000-000000000011')$$,
  '42501'
);

select pg_temp.expect_error(
  $$select public.clear_signature_look()$$,
  '42501'
);

rollback;
