-- C6.1 local-only integration proof.
-- Fixtures and all writes are rolled back.
begin;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'FAIL: %', p_message;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture user + Fashion DNA
-- ---------------------------------------------------------------------------
insert into auth.users (id, email)
values ('c6100000-0000-0000-0000-000000000001', 'c6-calibration@local.test');

insert into public.users (id, has_completed_calibration)
values ('c6100000-0000-0000-0000-000000000001', false)
on conflict (id) do update set has_completed_calibration = false;

insert into public.fashion_dna (user_id, vector)
values (
  'c6100000-0000-0000-0000-000000000001',
  '{"minimal":0.50,"formal":0.50}'
)
on conflict (user_id) do update
set vector = excluded.vector,
    updated_at = now();

-- Four curated style seeds support three distinct one-piece looks.
insert into public.wardrobe_items (
  id, category, subcategory, display_name, image_url,
  layer_role, source, status, style_tags
)
values
  (
    'c6100000-0000-0000-0000-000000000101',
    'one_piece', 'midi dress', 'Minimal midi dress', '/c6/dress-1.png',
    'one_piece', 'curated', 'confirmed', '{"minimal":0.9}'
  ),
  (
    'c6100000-0000-0000-0000-000000000102',
    'one_piece', 'jumpsuit', 'Structured jumpsuit', '/c6/dress-2.png',
    'one_piece', 'curated', 'confirmed', '{"formal":0.9}'
  ),
  (
    'c6100000-0000-0000-0000-000000000103',
    'footwear', 'pumps', 'Black pumps', '/c6/shoe-1.png',
    'footwear', 'curated', 'confirmed', '{"formal":0.8}'
  ),
  (
    'c6100000-0000-0000-0000-000000000104',
    'footwear', 'sneakers', 'White sneakers', '/c6/shoe-2.png',
    'footwear', 'curated', 'confirmed', '{"minimal":0.8}'
  );

insert into public.user_style_seed_items (user_id, item_id)
select 'c6100000-0000-0000-0000-000000000001', id
from public.wardrobe_items
where id::text like 'c6100000-%';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c6100000-0000-0000-0000-000000000001',
  true
);
select public.set_onboarding_owned_selection('{}'::uuid[], 0);

-- ---------------------------------------------------------------------------
-- Step 1: one persisted outfit, refresh/retry returns the same row.
-- ---------------------------------------------------------------------------
select set_config(
  'c6.step1',
  public.create_calibration_outfit_with_items(
    array[
      'c6100000-0000-0000-0000-000000000101'::uuid,
      'c6100000-0000-0000-0000-000000000103'::uuid
    ],
    '["step 1"]'::jsonb,
    '{"relationship":"style_seed","calibration_step":1}'::jsonb
  )::text,
  true
);

select set_config(
  'c6.step1_refresh',
  public.create_calibration_outfit_with_items(
    array[
      'c6100000-0000-0000-0000-000000000102'::uuid,
      'c6100000-0000-0000-0000-000000000104'::uuid
    ],
    '["different candidate on refresh"]'::jsonb,
    '{"relationship":"style_seed","calibration_step":1}'::jsonb
  )::text,
  true
);

select pg_temp.assert_true(
  current_setting('c6.step1') = current_setting('c6.step1_refresh'),
  'refresh/concurrent step-1 request must reuse the persisted step'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.outfits
    where user_id = 'c6100000-0000-0000-0000-000000000001'
      and source = 'calibration'
      and context_snapshot->>'calibration_step' = '1'
  ),
  'exactly one step-1 calibration outfit may exist'
);

select set_config(
  'c6.feedback1',
  (
    select to_jsonb(r)::text
    from public.submit_calibration_feedback(
      current_setting('c6.step1')::uuid,
      true,
      'c6-step-1'
    ) r
  ),
  true
);

select pg_temp.assert_true(
  (current_setting('c6.feedback1')::jsonb->>'answered_count')::integer = 1,
  'first answer increments server calibration progress to 1'
);

select pg_temp.assert_true(
  not (current_setting('c6.feedback1')::jsonb->>'completed')::boolean,
  'calibration must remain incomplete after one answer'
);

select pg_temp.assert_true(
  not (
    select has_completed_calibration
    from public.users
    where id = 'c6100000-0000-0000-0000-000000000001'
  ),
  'users.has_completed_calibration must remain false after step 1'
);

-- Replay the same idempotency key. It must not create a second event/version.
select public.submit_calibration_feedback(
  current_setting('c6.step1')::uuid,
  true,
  'c6-step-1'
);

select pg_temp.assert_true(
  (
    select count(*) = 1
    from public.preference_events
    where user_id = 'c6100000-0000-0000-0000-000000000001'
      and payload->>'source' = 'calibration'
  ),
  'replayed step-1 feedback must remain idempotent'
);

-- ---------------------------------------------------------------------------
-- Step 2
-- ---------------------------------------------------------------------------
select set_config(
  'c6.step2',
  public.create_calibration_outfit_with_items(
    array[
      'c6100000-0000-0000-0000-000000000102'::uuid,
      'c6100000-0000-0000-0000-000000000103'::uuid
    ],
    '["step 2"]'::jsonb,
    '{"relationship":"style_seed","calibration_step":2}'::jsonb
  )::text,
  true
);

select set_config(
  'c6.feedback2',
  (
    select to_jsonb(r)::text
    from public.submit_calibration_feedback(
      current_setting('c6.step2')::uuid,
      false,
      'c6-step-2'
    ) r
  ),
  true
);

select pg_temp.assert_true(
  (current_setting('c6.feedback2')::jsonb->>'answered_count')::integer = 2,
  'second answer increments server calibration progress to 2'
);

select pg_temp.assert_true(
  not (current_setting('c6.feedback2')::jsonb->>'completed')::boolean,
  'calibration must remain incomplete after two answers'
);

-- ---------------------------------------------------------------------------
-- Step 3: feedback completes the style check; onboarding remains pending.
-- ---------------------------------------------------------------------------
select set_config(
  'c6.step3',
  public.create_calibration_outfit_with_items(
    array[
      'c6100000-0000-0000-0000-000000000101'::uuid,
      'c6100000-0000-0000-0000-000000000104'::uuid
    ],
    '["step 3"]'::jsonb,
    '{"relationship":"style_seed","calibration_step":3}'::jsonb
  )::text,
  true
);

select set_config(
  'c6.feedback3',
  (
    select to_jsonb(r)::text
    from public.submit_calibration_feedback(
      current_setting('c6.step3')::uuid,
      true,
      'c6-step-3'
    ) r
  ),
  true
);

select pg_temp.assert_true(
  (current_setting('c6.feedback3')::jsonb->>'answered_count')::integer = 3,
  'third answer increments server calibration progress to 3'
);

select pg_temp.assert_true(
  (current_setting('c6.feedback3')::jsonb->>'completed')::boolean,
  'third answer must complete calibration on the server'
);

select pg_temp.assert_true(
  (select not has_completed_calibration from public.users
   where id = 'c6100000-0000-0000-0000-000000000001'),
  'third answer leaves onboarding pending'
);
select public.finalize_onboarding_owned_selection(1);
select pg_temp.assert_true(
  (select has_completed_calibration from public.users
   where id = 'c6100000-0000-0000-0000-000000000001'),
  'explicit finalization completes onboarding'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.preference_events
    where user_id = 'c6100000-0000-0000-0000-000000000001'
      and payload->>'source' = 'calibration'
  ),
  'exactly three distinct calibration preference events should exist'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.outfits
    where user_id = 'c6100000-0000-0000-0000-000000000001'
      and source = 'calibration'
      and context_snapshot ? 'calibration_step'
  ),
  'only the three actually-used calibration steps should be persisted'
);

reset role;
rollback;

select 'PASS: C6.1 calibration state-machine refresh/idempotency/progress/completion';
