-- C6.4: local end-to-end domain proof for cold-start -> calibration -> Today.
-- LOCAL SUPABASE ONLY. Every fixture and mutation is wrapped in a transaction
-- and rolled back at the end.
--
-- Proves:
--   1. curated selections live only in user_style_seed_items
--   2. calibration persists one numbered look at a time from style seeds
--   3. each distinct calibration answer advances Fashion DNA/version state
--   4. feedback replay is idempotent
--   5. exactly three distinct calibration answers complete calibration
--   6. both one-piece and separates calibration structures work
--   7. daily persistence rejects style seeds and accepts owned wardrobe items

begin;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $$
begin
  if p_condition is not true then
    raise exception 'FAIL: %', p_message;
  end if;
end;
$$;

create function pg_temp.expect_error(p_sql text, p_code text)
returns void
language plpgsql
as $$
declare
  v_code text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
    if v_code <> p_code then
      raise exception 'FAIL: expected SQLSTATE %, got %', p_code, v_code;
    end if;
    return;
  end;

  raise exception 'FAIL: expected error %', p_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixture user and starting Fashion DNA.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email)
values (
  'c6400000-0000-0000-0000-000000000001',
  'c6-flow@local.test'
);

insert into public.users (id, has_completed_calibration)
values ('c6400000-0000-0000-0000-000000000001', false)
on conflict (id) do update
set has_completed_calibration = false;

insert into public.fashion_dna (user_id, vector)
values (
  'c6400000-0000-0000-0000-000000000001',
  '{
    "minimal": 0.50,
    "classic": 0.50,
    "casual": 0.50,
    "relaxed": 0.50,
    "formal": 0.50,
    "edgy": 0.50
  }'::jsonb
)
on conflict (user_id) do update
set vector = excluded.vector,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- Curated style-reference catalog.
-- Two one-pieces + two footwear make onboarding eligible.
-- A top + bottom additionally proves the separates archetype.
-- ---------------------------------------------------------------------------

insert into public.wardrobe_items (
  id, category, subcategory, display_name, image_url,
  layer_role, source, status, style_tags
)
values
  (
    'c6400000-0000-0000-0000-000000000101',
    'one_piece', 'midi dress', 'Seed midi dress',
    '/c64/seed-dress-1.png', 'one_piece', 'curated', 'confirmed',
    '{"minimal":0.90}'::jsonb
  ),
  (
    'c6400000-0000-0000-0000-000000000102',
    'one_piece', 'jumpsuit', 'Seed jumpsuit',
    '/c64/seed-dress-2.png', 'one_piece', 'curated', 'confirmed',
    '{"formal":0.85}'::jsonb
  ),
  (
    'c6400000-0000-0000-0000-000000000103',
    'top', 'shirt', 'Seed relaxed shirt',
    '/c64/seed-top.png', 'base_layer', 'curated', 'confirmed',
    '{"casual":0.85}'::jsonb
  ),
  (
    'c6400000-0000-0000-0000-000000000104',
    'bottom', 'trousers', 'Seed relaxed trousers',
    '/c64/seed-bottom.png', 'bottom', 'curated', 'confirmed',
    '{"relaxed":0.85}'::jsonb
  ),
  (
    'c6400000-0000-0000-0000-000000000105',
    'footwear', 'loafer', 'Seed loafers',
    '/c64/seed-shoes-1.png', 'footwear', 'curated', 'confirmed',
    '{"classic":0.85}'::jsonb
  ),
  (
    'c6400000-0000-0000-0000-000000000106',
    'footwear', 'heels', 'Seed heels',
    '/c64/seed-shoes-2.png', 'footwear', 'curated', 'confirmed',
    '{"edgy":0.80}'::jsonb
  );

insert into public.user_style_seed_items (user_id, item_id)
select
  'c6400000-0000-0000-0000-000000000001',
  id
from public.wardrobe_items
where id in (
  'c6400000-0000-0000-0000-000000000101',
  'c6400000-0000-0000-0000-000000000102',
  'c6400000-0000-0000-0000-000000000103',
  'c6400000-0000-0000-0000-000000000104',
  'c6400000-0000-0000-0000-000000000105',
  'c6400000-0000-0000-0000-000000000106'
);

-- A real confirmed personal closet, deliberately separate from style seeds.
insert into public.wardrobe_items (
  id, category, subcategory, display_name, image_url,
  layer_role, source, status, style_tags
)
values
  (
    'c6400000-0000-0000-0000-000000000201',
    'one_piece', 'midi dress', 'Owned navy dress',
    '/c64/owned-dress.png', 'one_piece', 'user_upload', 'confirmed',
    '{"minimal":0.70}'::jsonb
  ),
  (
    'c6400000-0000-0000-0000-000000000202',
    'footwear', 'sneakers', 'Owned white sneakers',
    '/c64/owned-shoes.png', 'footwear', 'user_upload', 'confirmed',
    '{"casual":0.70}'::jsonb
  );

insert into public.user_wardrobe_items (user_id, item_id)
values
  (
    'c6400000-0000-0000-0000-000000000001',
    'c6400000-0000-0000-0000-000000000201'
  ),
  (
    'c6400000-0000-0000-0000-000000000001',
    'c6400000-0000-0000-0000-000000000202'
  );

select pg_temp.assert_true(
  (
    select count(*) = 6
    from public.user_style_seed_items
    where user_id = 'c6400000-0000-0000-0000-000000000001'
      and retired_at is null
  ),
  'curated selection creates six active style-seed relationships'
);

select pg_temp.assert_true(
  (
    select count(*) = 0
    from public.user_wardrobe_items
    where user_id = 'c6400000-0000-0000-0000-000000000001'
      and item_id in (
        'c6400000-0000-0000-0000-000000000101',
        'c6400000-0000-0000-0000-000000000102',
        'c6400000-0000-0000-0000-000000000103',
        'c6400000-0000-0000-0000-000000000104',
        'c6400000-0000-0000-0000-000000000105',
        'c6400000-0000-0000-0000-000000000106'
      )
  ),
  'curated style references never become ownership rows'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.user_wardrobe_items
    where user_id = 'c6400000-0000-0000-0000-000000000001'
      and retired_at is null
  ),
  'personal closet contains only the two owned uploaded items'
);

-- ---------------------------------------------------------------------------
-- Authenticated product flow.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'c6400000-0000-0000-0000-000000000001',
  true
);

select set_config(
  'c64.baseline_version',
  coalesce((
    select max(version)::text
    from public.fashion_dna_versions
    where user_id = 'c6400000-0000-0000-0000-000000000001'
  ), '-1'),
  true
);

select set_config(
  'c64.baseline_vector',
  (
    select vector::text
    from public.fashion_dna
    where user_id = 'c6400000-0000-0000-0000-000000000001'
  ),
  true
);

-- Look 1: one-piece archetype.
select set_config(
  'c64.step1_outfit',
  public.create_calibration_outfit_with_items(
    array[
      'c6400000-0000-0000-0000-000000000101'::uuid,
      'c6400000-0000-0000-0000-000000000105'::uuid
    ],
    '["C6.4 look 1"]'::jsonb,
    '{"relationship":"style_seed","calibration_step":1,"proof":"c6.4"}'::jsonb
  )::text,
  true
);

select pg_temp.assert_true(
  (
    select source = 'calibration'
      and context_snapshot->>'relationship' = 'style_seed'
      and context_snapshot->>'calibration_step' = '1'
    from public.outfits
    where id = current_setting('c64.step1_outfit')::uuid
  ),
  'look 1 is a numbered style-seed calibration outfit'
);

select pg_temp.assert_true(
  (
    select array_agg(slot order by position) = array['one_piece','footwear']
    from public.outfit_items
    where outfit_id = current_setting('c64.step1_outfit')::uuid
  ),
  'look 1 proves the one-piece calibration archetype'
);

select
  set_config('c64.step1_vector', r.vector::text, true),
  set_config('c64.step1_version', r.version::text, true),
  set_config('c64.step1_event', r.event_id::text, true),
  set_config('c64.step1_count', r.answered_count::text, true),
  set_config('c64.step1_completed', r.completed::text, true)
from public.submit_calibration_feedback(
  current_setting('c64.step1_outfit')::uuid,
  true,
  'c64-feedback-1'
) as r;

select pg_temp.assert_true(
  current_setting('c64.step1_count')::integer = 1
    and current_setting('c64.step1_completed')::boolean is false,
  'first distinct answer advances calibration to 1/3 without completing'
);

select pg_temp.assert_true(
  current_setting('c64.step1_version')::integer
    = current_setting('c64.baseline_version')::integer + 1,
  'first answer creates exactly one new Fashion DNA version'
);

select pg_temp.assert_true(
  current_setting('c64.step1_vector')::jsonb
    <> current_setting('c64.baseline_vector')::jsonb,
  'first answer changes Fashion DNA'
);

-- Look 2: separates archetype, created after look-1 DNA changed.
select set_config(
  'c64.step2_outfit',
  public.create_calibration_outfit_with_items(
    array[
      'c6400000-0000-0000-0000-000000000103'::uuid,
      'c6400000-0000-0000-0000-000000000104'::uuid,
      'c6400000-0000-0000-0000-000000000105'::uuid
    ],
    '["C6.4 look 2"]'::jsonb,
    '{"relationship":"style_seed","calibration_step":2,"proof":"c6.4"}'::jsonb
  )::text,
  true
);

select pg_temp.assert_true(
  (
    select array_agg(slot order by position)
      = array['base_layer','bottom','footwear']
    from public.outfit_items
    where outfit_id = current_setting('c64.step2_outfit')::uuid
  ),
  'look 2 proves the separates calibration archetype'
);

select pg_temp.assert_true(
  (
    select fashion_dna_updated_at = (
      select updated_at
      from public.fashion_dna
      where user_id = 'c6400000-0000-0000-0000-000000000001'
    )
    from public.outfits
    where id = current_setting('c64.step2_outfit')::uuid
  ),
  'look 2 snapshots the Fashion DNA state produced by look 1 feedback'
);

select
  set_config('c64.step2_vector', r.vector::text, true),
  set_config('c64.step2_version', r.version::text, true),
  set_config('c64.step2_event', r.event_id::text, true),
  set_config('c64.step2_count', r.answered_count::text, true),
  set_config('c64.step2_completed', r.completed::text, true)
from public.submit_calibration_feedback(
  current_setting('c64.step2_outfit')::uuid,
  false,
  'c64-feedback-2'
) as r;

select pg_temp.assert_true(
  current_setting('c64.step2_count')::integer = 2
    and current_setting('c64.step2_completed')::boolean is false,
  'second distinct answer advances calibration to 2/3 without completing'
);

select pg_temp.assert_true(
  current_setting('c64.step2_version')::integer
    = current_setting('c64.step1_version')::integer + 1,
  'second answer creates exactly one additional Fashion DNA version'
);

select pg_temp.assert_true(
  current_setting('c64.step2_vector')::jsonb
    <> current_setting('c64.step1_vector')::jsonb,
  'second answer changes Fashion DNA again'
);

-- Replay look 2 with the identical idempotency key.
select
  set_config('c64.step2_replay_version', r.version::text, true),
  set_config('c64.step2_replay_event', r.event_id::text, true),
  set_config('c64.step2_replay_count', r.answered_count::text, true)
from public.submit_calibration_feedback(
  current_setting('c64.step2_outfit')::uuid,
  false,
  'c64-feedback-2'
) as r;

select pg_temp.assert_true(
  current_setting('c64.step2_replay_version') = current_setting('c64.step2_version')
    and current_setting('c64.step2_replay_event') = current_setting('c64.step2_event')
    and current_setting('c64.step2_replay_count')::integer = 2,
  'feedback replay returns the same event/version and does not advance progress'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.preference_events
    where user_id = 'c6400000-0000-0000-0000-000000000001'
      and event_type = 'outfit_feedback'
      and payload->>'source' = 'calibration'
  ),
  'feedback replay does not create a third preference event'
);

-- Look 3: another one-piece combination, now from the DNA after look 2.
select set_config(
  'c64.step3_outfit',
  public.create_calibration_outfit_with_items(
    array[
      'c6400000-0000-0000-0000-000000000102'::uuid,
      'c6400000-0000-0000-0000-000000000106'::uuid
    ],
    '["C6.4 look 3"]'::jsonb,
    '{"relationship":"style_seed","calibration_step":3,"proof":"c6.4"}'::jsonb
  )::text,
  true
);

select pg_temp.assert_true(
  (
    select fashion_dna_updated_at = (
      select updated_at
      from public.fashion_dna
      where user_id = 'c6400000-0000-0000-0000-000000000001'
    )
    from public.outfits
    where id = current_setting('c64.step3_outfit')::uuid
  ),
  'look 3 snapshots the Fashion DNA state produced by look 2 feedback'
);

select
  set_config('c64.step3_vector', r.vector::text, true),
  set_config('c64.step3_version', r.version::text, true),
  set_config('c64.step3_event', r.event_id::text, true),
  set_config('c64.step3_count', r.answered_count::text, true),
  set_config('c64.step3_completed', r.completed::text, true)
from public.submit_calibration_feedback(
  current_setting('c64.step3_outfit')::uuid,
  true,
  'c64-feedback-3'
) as r;

select pg_temp.assert_true(
  current_setting('c64.step3_count')::integer = 3
    and current_setting('c64.step3_completed')::boolean is true,
  'third distinct answer completes calibration at exactly 3/3'
);

select pg_temp.assert_true(
  current_setting('c64.step3_version')::integer
    = current_setting('c64.step2_version')::integer + 1,
  'third answer creates exactly one additional Fashion DNA version'
);

select pg_temp.assert_true(
  current_setting('c64.step3_vector')::jsonb
    <> current_setting('c64.step2_vector')::jsonb,
  'third answer changes Fashion DNA again'
);

select pg_temp.assert_true(
  (
    select has_completed_calibration
    from public.users
    where id = 'c6400000-0000-0000-0000-000000000001'
  ),
  'server marks initial calibration complete after three distinct answers'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
    from public.preference_events
    where user_id = 'c6400000-0000-0000-0000-000000000001'
      and event_type = 'outfit_feedback'
      and payload->>'source' = 'calibration'
  ),
  'exactly three calibration preference events exist'
);

select pg_temp.assert_true(
  (
    select count(*) = 3
      and count(distinct context_snapshot->>'calibration_step') = 3
    from public.outfits
    where user_id = 'c6400000-0000-0000-0000-000000000001'
      and source = 'calibration'
      and context_snapshot ? 'calibration_step'
  ),
  'exactly one persisted calibration outfit exists for each of steps 1, 2 and 3'
);

-- ---------------------------------------------------------------------------
-- Today boundary: style seeds must never act as owned clothes.
-- ---------------------------------------------------------------------------

select pg_temp.expect_error(
  $q$
    select public.create_outfit_with_items(
      array[
        'c6400000-0000-0000-0000-000000000101'::uuid,
        'c6400000-0000-0000-0000-000000000105'::uuid
      ],
      'daily_fallback',
      '["must reject style seeds"]'::jsonb,
      null,
      null,
      'c6.4-proof',
      '{"proof":"style-seed-rejection"}'::jsonb
    )
  $q$,
  '22023'
);

select set_config(
  'c64.daily_outfit',
  public.create_outfit_with_items(
    array[
      'c6400000-0000-0000-0000-000000000201'::uuid,
      'c6400000-0000-0000-0000-000000000202'::uuid
    ],
    'daily_fallback',
    '["owned wardrobe only"]'::jsonb,
    null,
    null,
    'c6.4-proof',
    '{"proof":"owned-wardrobe"}'::jsonb
  )::text,
  true
);

select pg_temp.assert_true(
  (
    select source = 'daily_fallback'
    from public.outfits
    where id = current_setting('c64.daily_outfit')::uuid
  ),
  'Today/daily persistence succeeds with owned wardrobe items'
);

select pg_temp.assert_true(
  (
    select count(*) = 2
    from public.outfit_items
    where outfit_id = current_setting('c64.daily_outfit')::uuid
  ),
  'Today/daily outfit persists the two owned items'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.outfit_items oi
    join public.user_style_seed_items usi
      on usi.item_id = oi.wardrobe_item_id
     and usi.user_id = 'c6400000-0000-0000-0000-000000000001'
    where oi.outfit_id = current_setting('c64.daily_outfit')::uuid
  ),
  'Today/daily persisted outfit contains no style-seed item'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.outfit_items oi
    left join public.user_wardrobe_items uwi
      on uwi.item_id = oi.wardrobe_item_id
     and uwi.user_id = 'c6400000-0000-0000-0000-000000000001'
     and uwi.retired_at is null
    where oi.outfit_id = current_setting('c64.daily_outfit')::uuid
      and uwi.item_id is null
  ),
  'every Today/daily item is backed by active ownership'
);

reset role;

rollback;

select 'PASS: C6.4 style-seed -> adaptive calibration -> Fashion DNA -> owned-only Today proof';
