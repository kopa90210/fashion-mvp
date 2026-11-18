-- Gate 1: Saved and Worn History Database Tests
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
  ('d1000000-0000-0000-0000-000000000001', 'd1-user-a@local.test'),
  ('d1000000-0000-0000-0000-000000000002', 'd1-user-b@local.test')
on conflict (id) do nothing;

insert into public.users (id, timezone) values
  ('d1000000-0000-0000-0000-000000000001', 'America/New_York'),
  ('d1000000-0000-0000-0000-000000000002', 'Europe/London')
on conflict (id) do update set timezone = excluded.timezone;

-- User A Outfits
insert into public.outfits (id, user_id, source, status, scheduled_for) values
  ('d1000000-0000-0000-0000-000000000011', 'd1000000-0000-0000-0000-000000000001', 'daily_ai', 'generated', '2026-10-26'),
  ('d1000000-0000-0000-0000-000000000012', 'd1000000-0000-0000-0000-000000000001', 'engine', 'superseded', '2026-10-25'),
  ('d1000000-0000-0000-0000-000000000013', 'd1000000-0000-0000-0000-000000000001', 'calibration', 'generated', null),
  ('d1000000-0000-0000-0000-000000000014', 'd1000000-0000-0000-0000-000000000001', 'daily_ai', 'invalid', '2026-10-24')
on conflict (id) do nothing;

-- User B Outfit
insert into public.outfits (id, user_id, source, status, scheduled_for) values
  ('d1000000-0000-0000-0000-000000000021', 'd1000000-0000-0000-0000-000000000002', 'daily_ai', 'generated', '2026-10-26')
on conflict (id) do nothing;

-- Garments for User A's outfit
insert into public.wardrobe_items (id, category, subcategory, display_name, image_url, layer_role, source) values
  ('a1000000-0000-0000-0000-000000000001', 'top', 'button_down', 'White Oxford Shirt', 'https://test/shirt.jpg', 'base_layer', 'user_upload'),
  ('a1000000-0000-0000-0000-000000000002', 'bottom', 'chinos', 'Navy Chinos', 'https://test/pants.jpg', 'bottom', 'user_upload')
on conflict (id) do nothing;

insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position) values
  ('d1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000001', 'base_layer', 0),
  ('d1000000-0000-0000-0000-000000000011', 'a1000000-0000-0000-0000-000000000002', 'bottom', 1)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Authenticate as User A
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);

-- ---------------------------------------------------------------------------
-- Test 1: Saved Looks & Historical Snapshot Preservation
-- ---------------------------------------------------------------------------

-- 1a. Save eligible outfit and verify snapshot capture
select public.save_outfit_look('d1000000-0000-0000-0000-000000000011');
select pg_temp.assert_true(
  (select count(*) = 1 from public.saved_outfits where user_id = 'd1000000-0000-0000-0000-000000000001'),
  'User A can save an eligible outfit'
);
select pg_temp.assert_true(
  (select jsonb_array_length(garment_snapshot) = 2 from public.saved_outfits where user_id = 'd1000000-0000-0000-0000-000000000001' and outfit_id = 'd1000000-0000-0000-0000-000000000011'),
  'Saved outfit captured 2-garment snapshot server-side'
);

-- 1b. Historical preservation: Delete one garment from wardrobe_items (cascades from outfit_items)
reset role;
delete from public.wardrobe_items where id = 'a1000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.outfit_items where outfit_id = 'd1000000-0000-0000-0000-000000000011'),
  'Live outfit_items cascaded and now has only 1 item'
);
select pg_temp.assert_true(
  (select jsonb_array_length(garment_snapshot) = 2 from public.saved_outfits where user_id = 'd1000000-0000-0000-0000-000000000001' and outfit_id = 'd1000000-0000-0000-0000-000000000011'),
  'Historical saved outfit still preserves all 2 garments in snapshot across deletion'
);

-- 1c. Superseded outfit is eligible
select public.save_outfit_look('d1000000-0000-0000-0000-000000000012');
select pg_temp.assert_true(
  (select count(*) = 2 from public.saved_outfits where user_id = 'd1000000-0000-0000-0000-000000000001'),
  'Superseded outfit can be saved and remains saved'
);

-- 1d. Duplicate save is idempotent
select public.save_outfit_look('d1000000-0000-0000-0000-000000000011');
select pg_temp.assert_true(
  (select count(*) = 2 from public.saved_outfits where user_id = 'd1000000-0000-0000-0000-000000000001'),
  'Duplicate save does not create extra rows'
);

-- 1e. Cross-user save rejected
select pg_temp.expect_error(
  $q$select public.save_outfit_look('d1000000-0000-0000-0000-000000000021')$q$,
  '42501'
);

-- 1f. Calibration outfit save rejected
select pg_temp.expect_error(
  $q$select public.save_outfit_look('d1000000-0000-0000-0000-000000000013')$q$,
  '42501'
);

-- 1g. Invalid outfit save rejected
select pg_temp.expect_error(
  $q$select public.save_outfit_look('d1000000-0000-0000-0000-000000000014')$q$,
  '42501'
);

-- 1h. Unsave outfit
select public.unsave_outfit_look('d1000000-0000-0000-0000-000000000011');
select pg_temp.assert_true(
  (select count(*) = 1 from public.saved_outfits where user_id = 'd1000000-0000-0000-0000-000000000001'),
  'Unsave removes row'
);

-- ---------------------------------------------------------------------------
-- Test 2: Unified Transactional Wear Recording & Replay Semantics
-- ---------------------------------------------------------------------------

-- 2a. Record wear with default date and idempotency key
select public.record_canonical_outfit_worn('d1000000-0000-0000-0000-000000000011', null, 'idemp-tx-1');
select pg_temp.assert_true(
  (select count(*) = 1 from public.outfit_wear_records where user_id = 'd1000000-0000-0000-0000-000000000001'),
  'Wear record inserted'
);
select pg_temp.assert_true(
  (select count(*) = 1 from public.outfit_interactions where user_id = 'd1000000-0000-0000-0000-000000000001' and idempotency_key = 'idemp-tx-1'),
  'Behavioral event inserted atomically in same transaction'
);

-- 2b. Retry after lost response (same key) returns replayed=true without duplicate interaction
do $$
declare
  v_res jsonb;
begin
  select public.record_canonical_outfit_worn('d1000000-0000-0000-0000-000000000011', null, 'idemp-tx-1') into v_res;
  perform pg_temp.assert_true(
    (v_res->>'replayed')::boolean = true and (v_res->>'undone')::boolean = false,
    'Retry returns replayed=true, undone=false'
  );
end;
$$;
select pg_temp.assert_true(
  (select count(*) = 1 from public.outfit_interactions where user_id = 'd1000000-0000-0000-0000-000000000001' and idempotency_key = 'idemp-tx-1'),
  'No duplicate interaction event on retry'
);

-- 2c. Same outfit worn on different date
select public.record_canonical_outfit_worn('d1000000-0000-0000-0000-000000000011', '2026-10-20'::date, 'idemp-tx-2');
select pg_temp.assert_true(
  (select count(*) = 2 from public.outfit_wear_records where user_id = 'd1000000-0000-0000-0000-000000000001'),
  'Same outfit worn on distinct date'
);

-- 2d. Repeated taps on same date (different idempotency key) is idempotent on wear records
select public.record_canonical_outfit_worn('d1000000-0000-0000-0000-000000000011', '2026-10-20'::date, 'idemp-tx-3');
select pg_temp.assert_true(
  (select count(*) = 2 from public.outfit_wear_records where user_id = 'd1000000-0000-0000-0000-000000000001'),
  'Repeated tap for same date does not duplicate wear record'
);

-- 2e. Update wear date
do $$
declare
  v_rec_id uuid;
begin
  select id into v_rec_id
  from public.outfit_wear_records
  where user_id = 'd1000000-0000-0000-0000-000000000001' and worn_on = '2026-10-20';

  perform public.update_outfit_wear_date(v_rec_id, '2026-10-18'::date);
end;
$$;
select pg_temp.assert_true(
  (select exists (select 1 from public.outfit_wear_records where user_id = 'd1000000-0000-0000-0000-000000000001' and worn_on = '2026-10-18')),
  'Wear date updated to 2026-10-18'
);

-- 2f. Date correction followed by an old request retry does NOT recreate or revert old date
do $$
declare
  v_res jsonb;
begin
  -- Old request retry with idemp-tx-2 (originally for 2026-10-20)
  select public.record_canonical_outfit_worn('d1000000-0000-0000-0000-000000000011', '2026-10-20'::date, 'idemp-tx-2') into v_res;
  perform pg_temp.assert_true(
    (v_res->>'worn_on') = '2026-10-18',
    'Retry reflects corrected date 2026-10-18 and did not overwrite it'
  );
end;
$$;

-- 2g. Update wear date conflict rejection
do $$
declare
  v_rec_id uuid;
begin
  select id into v_rec_id
  from public.outfit_wear_records
  where user_id = 'd1000000-0000-0000-0000-000000000001' and worn_on = '2026-10-18';

  perform pg_temp.expect_error(
    format('select public.update_outfit_wear_date(''%s''::uuid, ''%s''::date)', v_rec_id, (select worn_on from public.outfit_wear_records where id <> v_rec_id limit 1)),
    '23505'
  );
end;
$$;

-- 2h. Undo wear followed by an old request retry: MUST NOT silently recreate undone record!
do $$
declare
  v_rec_id uuid;
  v_res jsonb;
begin
  select id into v_rec_id
  from public.outfit_wear_records
  where user_id = 'd1000000-0000-0000-0000-000000000001' and worn_on = '2026-10-18';

  -- User undoes the wear
  perform public.undo_outfit_worn(v_rec_id);

  -- Old client request retries with idemp-tx-2
  select public.record_canonical_outfit_worn('d1000000-0000-0000-0000-000000000011', '2026-10-18'::date, 'idemp-tx-2') into v_res;
  perform pg_temp.assert_true(
    (v_res->>'replayed')::boolean = true and (v_res->>'undone')::boolean = true and (v_res->>'id') is null,
    'Retry after undo recognized as undone and did NOT recreate wear record'
  );
end;
$$;
select pg_temp.assert_true(
  (select count(*) = 1 from public.outfit_wear_records where user_id = 'd1000000-0000-0000-0000-000000000001'),
  'Wear record remained deleted after retry'
);

-- ---------------------------------------------------------------------------
-- Test 3: RLS Isolation
-- ---------------------------------------------------------------------------

-- Switch to User B
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000002', true);

-- User B cannot see User A's saved outfits
select pg_temp.assert_true(
  (select count(*) = 0 from public.saved_outfits),
  'RLS: User B cannot select User A saved outfits'
);

-- User B cannot see User A's wear records
select pg_temp.assert_true(
  (select count(*) = 0 from public.outfit_wear_records),
  'RLS: User B cannot select User A wear records'
);

rollback;
