-- Run on a disposable migrated database. Fixtures and mutations roll back.
begin;

create function pg_temp.assert_true(ok boolean, message text) returns void
language plpgsql as $$ begin
  if ok is not true then raise exception 'FAIL: %', message; end if;
end $$;

create function pg_temp.expect_error(statement text, expected_code text) returns void
language plpgsql as $$
declare actual_code text;
begin
  begin execute statement;
  exception when others then
    get stacked diagnostics actual_code = returned_sqlstate;
    if actual_code <> expected_code then
      raise exception 'Expected %, got %', expected_code, actual_code;
    end if;
    return;
  end;
  raise exception 'Expected error %', expected_code;
end $$;

insert into auth.users(id, email) values
 ('d1000000-0000-0000-0000-000000000001', 'onboarding-a@local.test'),
 ('d1000000-0000-0000-0000-000000000002', 'onboarding-b@local.test');
insert into public.users(id, has_completed_calibration) values
 ('d1000000-0000-0000-0000-000000000001', false),
 ('d1000000-0000-0000-0000-000000000002', false)
 on conflict (id) do update set has_completed_calibration = false;
insert into public.wardrobe_items(id, category, display_name, image_url, layer_role, source, status)
values
 ('d1000000-0000-0000-0000-000000000101', 'top', 'Historical only', '/a.png', 'base_layer', 'curated', 'confirmed'),
 ('d1000000-0000-0000-0000-000000000102', 'bottom', 'Selected', '/b.png', 'bottom', 'curated', 'confirmed'),
 ('d1000000-0000-0000-0000-000000000103', 'footwear', 'Other user', '/c.png', 'footwear', 'curated', 'confirmed');
insert into public.user_style_seed_items(user_id, item_id) values
 ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000101');
insert into public.user_wardrobe_items(user_id, item_id, retired_at) values
 ('d1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000102', now()),
 ('d1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000103', null);
insert into public.outfits(user_id, item_ids, source, scheduled_for, status)
values ('d1000000-0000-0000-0000-000000000001', '[]'::jsonb,
        'daily_ai', (now() at time zone 'UTC')::date, 'generated');
insert into public.outfit_interactions(user_id, outfit_id, event_type, idempotency_key)
select user_id, id, 'outfit_worn', 'onboarding-old-worn' from public.outfits
where user_id = 'd1000000-0000-0000-0000-000000000001' and source = 'daily_ai';
insert into public.outfits(user_id, item_ids, source, scheduled_for, status, parent_outfit_id)
select user_id, '[]'::jsonb, 'swap', scheduled_for, 'generated', id
from public.outfits where user_id = 'd1000000-0000-0000-0000-000000000001' and source = 'daily_ai';
insert into public.ai_jobs(user_id, job_type, idempotency_key, scheduled_for)
values ('d1000000-0000-0000-0000-000000000001', 'daily_outfit',
        'daily:' || (now() at time zone 'UTC')::date || ':v1',
        (now() at time zone 'UTC')::date);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000001', true);
select pg_temp.expect_error('select public.finalize_onboarding_owned_selection(0)', '22023');
select pg_temp.assert_true((select count(*) = 0 from public.onboarding_owned_selections), 'no pending row before selection');
select pg_temp.assert_true(public.set_onboarding_owned_selection(
 array['d1000000-0000-0000-0000-000000000102'::uuid], 0) = 1, 'first selection version');
select pg_temp.assert_true((select count(*) = 1 from public.onboarding_owned_selections), 'pending row visible to owner');
select pg_temp.assert_true(public.set_onboarding_owned_selection('{}'::uuid[], 1) = 2, 'deselection increments version');
select pg_temp.assert_true((select cardinality(item_ids) = 0 from public.onboarding_owned_selections), 'deselection clears pending items');
select pg_temp.assert_true(public.set_onboarding_owned_selection(
 array['d1000000-0000-0000-0000-000000000102'::uuid], 2) = 3, 'latest selection is saved');
select pg_temp.expect_error('select public.finalize_onboarding_owned_selection(3)', '22023');
select pg_temp.assert_true((select retired_at is not null from public.user_wardrobe_items where item_id = 'd1000000-0000-0000-0000-000000000102'), 'selection did not reactivate ownership');
select pg_temp.expect_error('insert into public.user_wardrobe_items(user_id,item_id) values (''d1000000-0000-0000-0000-000000000001'',''d1000000-0000-0000-0000-000000000101'')', '42501');
select pg_temp.expect_error('update public.onboarding_owned_selections set committed_at = now()', '42501');

set local role postgres;
insert into public.preference_events(user_id, event_type, idempotency_key, payload)
select 'd1000000-0000-0000-0000-000000000001', 'outfit_feedback',
       'onboarding-check-' || n, '{"source":"calibration"}'::jsonb
from generate_series(1, 3) n;
update public.wardrobe_items set status = 'rejected' where id = 'd1000000-0000-0000-0000-000000000102';
set local role authenticated;
select pg_temp.expect_error('select public.finalize_onboarding_owned_selection(3)', '22023');
select pg_temp.assert_true((select not has_completed_calibration from public.users where id = 'd1000000-0000-0000-0000-000000000001'), 'failed finalization did not complete');
set local role postgres;
update public.wardrobe_items set status = 'confirmed' where id = 'd1000000-0000-0000-0000-000000000102';
set local role authenticated;
select pg_temp.expect_error('select public.finalize_onboarding_owned_selection(2)', '40001');
select pg_temp.assert_true((select item_count = 1 and completed from public.finalize_onboarding_owned_selection(3)), 'finalization committed latest selected item');
select pg_temp.assert_true((select item_count = 1 and completed from public.finalize_onboarding_owned_selection(3)), 'lost response retry is idempotent');
select pg_temp.expect_error('select public.finalize_onboarding_owned_selection(2)', '40001');
select pg_temp.assert_true((select count(*) = 1 from public.user_wardrobe_items where user_id = 'd1000000-0000-0000-0000-000000000001' and retired_at is null), 'only current selection owned');
select pg_temp.assert_true((select count(*) = 0 from public.user_wardrobe_items where item_id = 'd1000000-0000-0000-0000-000000000101'), 'historical seed not converted');
select pg_temp.assert_true((select retired_at is null from public.user_style_seed_items where user_id = 'd1000000-0000-0000-0000-000000000001' and item_id = 'd1000000-0000-0000-0000-000000000101'), 'historical style preference preserved');
select pg_temp.assert_true((select status = 'superseded' from public.outfits where user_id = 'd1000000-0000-0000-0000-000000000001' and source = 'daily_ai'), 'old generated daily preserved and superseded');
select pg_temp.assert_true((select count(*) = 1 from public.outfit_interactions where idempotency_key = 'onboarding-old-worn'), 'worn history preserved');
select pg_temp.assert_true((select count(*) = 1 from public.outfits where source = 'swap' and status = 'generated'), 'saved swap child preserved');
select pg_temp.assert_true((select status = 'dead_letter' and safe_error_code = 'STALE_LEASE'
  from public.ai_jobs where idempotency_key like 'daily:%:v1'), 'pre-commit daily job invalidated');
select set_config('onboarding.test_job_id', public.enqueue_daily_outfit_job()::text, true);
select pg_temp.assert_true((select idempotency_key like '%:onboarding:3' from public.ai_jobs where id = current_setting('onboarding.test_job_id')::uuid), 'new AI job uses committed selection version');
select pg_temp.expect_error('select public.set_onboarding_owned_selection(''{}''::uuid[], 1)', '22023');

select set_config('request.jwt.claim.sub', 'd1000000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true((select count(*) = 0 from public.onboarding_owned_selections), 'cross-user pending row hidden');
select pg_temp.assert_true((select count(*) = 1 from public.user_wardrobe_items where user_id = 'd1000000-0000-0000-0000-000000000002'), 'other user unchanged');
select pg_temp.assert_true(public.set_onboarding_owned_selection('{}'::uuid[], 0) = 1, 'empty selection allowed');
set local role postgres;
insert into public.preference_events(user_id, event_type, idempotency_key, payload)
select 'd1000000-0000-0000-0000-000000000002', 'outfit_feedback',
       'empty-check-' || n, '{"source":"calibration"}'::jsonb
from generate_series(1, 3) n;
set local role authenticated;
select pg_temp.assert_true((select item_count = 0 and completed from public.finalize_onboarding_owned_selection(1)), 'empty selection completes with zero new memberships');
select pg_temp.assert_true((select count(*) = 1 from public.user_wardrobe_items where user_id = 'd1000000-0000-0000-0000-000000000002'), 'empty selection preserves existing clothes');
set local role anon;
select pg_temp.expect_error('select public.finalize_onboarding_owned_selection(1)', '42501');

rollback;
