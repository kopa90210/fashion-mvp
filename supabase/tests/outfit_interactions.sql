-- Execute only on local Supabase. Every fixture/event is rolled back.
begin;
create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $$ begin
  if p_condition is not true then raise exception 'FAIL: %', p_message; end if;
end; $$;
create function pg_temp.expect_error(p_sql text, p_code text)
returns void language plpgsql as $$ declare v_code text; begin
  begin execute p_sql;
  exception when others then
    get stacked diagnostics v_code = returned_sqlstate;
    if v_code <> p_code then raise exception 'FAIL: expected %, got %', p_code, v_code; end if;
    return;
  end;
  raise exception 'FAIL: expected error %', p_code;
end; $$;

insert into auth.users (id, email) values
  ('be100000-0000-0000-0000-000000000001', 'be1-owner-a@local.test'),
  ('be100000-0000-0000-0000-000000000002', 'be1-owner-b@local.test');
insert into public.users (id) values
  ('be100000-0000-0000-0000-000000000001'), ('be100000-0000-0000-0000-000000000002') on conflict do nothing;
insert into public.fashion_dna (user_id, vector) values
  ('be100000-0000-0000-0000-000000000001', '{"minimal":0.5}'),
  ('be100000-0000-0000-0000-000000000002', '{"minimal":0.5}') on conflict do nothing;
insert into public.outfits (id, user_id, source) values
  ('be100000-0000-0000-0000-000000000011', 'be100000-0000-0000-0000-000000000001', 'engine'),
  ('be100000-0000-0000-0000-000000000012', 'be100000-0000-0000-0000-000000000002', 'engine');
insert into public.feedback (user_id, outfit_id, liked, source) values
  ('be100000-0000-0000-0000-000000000001', 'be100000-0000-0000-0000-000000000011', true, 'daily');
create temp table preference_before as select
  (select jsonb_agg(to_jsonb(f) order by user_id) from public.fashion_dna f where user_id::text like 'be100000-%') as dna,
  (select jsonb_agg(to_jsonb(f) order by id) from public.feedback f where user_id::text like 'be100000-%') as feedback,
  (select count(*) from public.preference_events where user_id::text like 'be100000-%') as preferences,
  (select count(*) from public.fashion_dna_versions where user_id::text like 'be100000-%') as versions;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'be100000-0000-0000-0000-000000000001', true);
select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011', 'outfit_worn', 'worn', '{"screen":"today"}');
select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011', 'outfit_not_today', 'not-today');
select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011', 'outfit_viewed', 'viewed');
select pg_temp.assert_true((select count(*) = 3 from public.outfit_interactions), 'owner can record and read all three event types');
select pg_temp.assert_true(
  public.record_outfit_interaction('be100000-0000-0000-0000-000000000011', 'outfit_worn', 'worn', '{"screen":"today"}')
  = (select id from public.outfit_interactions where idempotency_key = 'worn'), 'replay returns original event UUID');
select pg_temp.assert_true((select count(*) = 3 from public.outfit_interactions), 'replay does not create duplicate');
select pg_temp.assert_true((select bool_and(item_id is null and replacement_item_id is null) from public.outfit_interactions), 'unused item references remain null');

select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000012','outfit_worn','foreign')$q$, '42501');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','swap','invalid')$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011',null,'invalid')$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','outfit_worn',' ')$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','outfit_worn',null)$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','outfit_worn',repeat('x',201))$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','outfit_worn','bad-context','[]')$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','outfit_worn','bad-context',null)$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','outfit_not_today','worn')$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','outfit_worn','worn','{"changed":true}')$q$, '22023');
select pg_temp.expect_error($q$insert into public.outfit_interactions(user_id,outfit_id,event_type,idempotency_key) values('be100000-0000-0000-0000-000000000001','be100000-0000-0000-0000-000000000011','outfit_worn','bypass')$q$, '42501');
select pg_temp.expect_error($q$update public.outfit_interactions set event_type='outfit_viewed'$q$, '42501');
select pg_temp.expect_error($q$delete from public.outfit_interactions$q$, '42501');

select set_config('request.jwt.claim.sub', '', true);
select pg_temp.expect_error($q$select public.record_outfit_interaction('be100000-0000-0000-0000-000000000011','outfit_worn','anonymous')$q$, '42501');
select pg_temp.assert_true((select count(*) = 0 from public.outfit_interactions), 'missing identity cannot read rows');

select set_config('request.jwt.claim.sub', 'be100000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true((select count(*) = 0 from public.outfit_interactions), 'cross-user interaction reads hidden by RLS');
select public.record_outfit_interaction('be100000-0000-0000-0000-000000000012', 'outfit_worn', 'worn');
select pg_temp.assert_true((select count(*) = 1 from public.outfit_interactions), 'idempotency namespace is per user');
select pg_temp.assert_true((select count(*) = 0 from public.outfit_interactions where user_id = 'be100000-0000-0000-0000-000000000001'), 'explicit foreign-user filter still cannot bypass RLS');

reset role;
select pg_temp.assert_true((select relrowsecurity from pg_class where oid = 'public.outfit_interactions'::regclass), 'RLS enabled');
select pg_temp.assert_true(not has_function_privilege('anon','public.record_outfit_interaction(uuid,text,text,jsonb)','execute'), 'anon cannot execute RPC');
select pg_temp.assert_true(not has_table_privilege('anon','public.outfit_interactions','select'), 'anon cannot read ledger');
select pg_temp.assert_true((select dna = (select jsonb_agg(to_jsonb(f) order by user_id) from public.fashion_dna f where user_id::text like 'be100000-%')
  and feedback = (select jsonb_agg(to_jsonb(f) order by id) from public.feedback f where user_id::text like 'be100000-%')
  and preferences = (select count(*) from public.preference_events where user_id::text like 'be100000-%')
  and versions = (select count(*) from public.fashion_dna_versions where user_id::text like 'be100000-%') from preference_before), 'feedback, DNA, preference ledger and DNA versions unchanged');
select pg_temp.expect_error($q$insert into public.outfit_interactions(user_id,outfit_id,event_type,idempotency_key) values('be100000-0000-0000-0000-000000000001','be100000-0000-0000-0000-000000000011','swap','constraint-event')$q$, '23514');
select pg_temp.expect_error($q$insert into public.outfit_interactions(user_id,outfit_id,event_type,idempotency_key,context_snapshot) values('be100000-0000-0000-0000-000000000001','be100000-0000-0000-0000-000000000011','outfit_viewed','constraint-context','[]')$q$, '23514');
select pg_temp.assert_true((select count(*) = 4 from public.outfit_interactions where user_id in ('be100000-0000-0000-0000-000000000001','be100000-0000-0000-0000-000000000002')), 'rejected requests do not add events');
rollback;
select 'PASS: outfit interaction owner/RPC/input/idempotency/RLS/preference isolation tests';
