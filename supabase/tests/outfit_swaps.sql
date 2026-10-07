-- Execute only on local Supabase. Every fixture and schema test hook is rolled back.
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
create function pg_temp.reject_rollback_swap()
returns trigger language plpgsql as $$ begin
  if new.idempotency_key = 'rollback-key' then raise exception 'forced event failure'; end if;
  return new;
end; $$;
create trigger be2_force_swap_failure before insert on public.outfit_interactions
for each row execute function pg_temp.reject_rollback_swap();

insert into auth.users (id, email) values
  ('be200000-0000-0000-0000-000000000001', 'be2-owner-a@local.test'),
  ('be200000-0000-0000-0000-000000000002', 'be2-owner-b@local.test');
insert into public.users (id) values
  ('be200000-0000-0000-0000-000000000001'),
  ('be200000-0000-0000-0000-000000000002')
on conflict do nothing;
insert into public.fashion_dna (user_id, vector) values
  ('be200000-0000-0000-0000-000000000001', '{"minimal":0.8}'),
  ('be200000-0000-0000-0000-000000000002', '{"minimal":0.5}')
on conflict (user_id) do update set vector = excluded.vector;

insert into public.wardrobe_items
  (id, category, display_name, image_url, layer_role, source, status, style_tags)
values
  ('be200000-0000-0000-0000-000000000101', 'top', 'Original top', '/be2/original.png', 'base_layer', 'user_upload', 'confirmed', '{"minimal":0.5}'),
  ('be200000-0000-0000-0000-000000000102', 'bottom', 'Bottom', '/be2/bottom.png', 'bottom', 'user_upload', 'confirmed', '{"minimal":0.5}'),
  ('be200000-0000-0000-0000-000000000103', 'footwear', 'Shoes', '/be2/shoes.png', 'footwear', 'user_upload', 'confirmed', '{"minimal":0.5}'),
  ('be200000-0000-0000-0000-000000000104', 'top', 'Replacement top', '/be2/replacement.png', 'base_layer', 'user_upload', 'confirmed', '{"minimal":0.9}'),
  ('be200000-0000-0000-0000-000000000105', 'footwear', 'Wrong role', '/be2/wrong.png', 'footwear', 'user_upload', 'confirmed', '{"minimal":0.9}'),
  ('be200000-0000-0000-0000-000000000106', 'top', 'Foreign top', '/be2/foreign.png', 'base_layer', 'user_upload', 'confirmed', '{"minimal":0.9}'),
  ('be200000-0000-0000-0000-000000000107', 'top', 'Draft top', '/be2/draft.png', 'base_layer', 'user_upload', 'draft', '{"minimal":0.9}'),
  ('be200000-0000-0000-0000-000000000108', 'top', 'Retired top', '/be2/retired.png', 'base_layer', 'user_upload', 'confirmed', '{"minimal":0.9}');

insert into public.user_wardrobe_items (user_id, item_id, retired_at) values
  ('be200000-0000-0000-0000-000000000001', 'be200000-0000-0000-0000-000000000101', null),
  ('be200000-0000-0000-0000-000000000001', 'be200000-0000-0000-0000-000000000102', null),
  ('be200000-0000-0000-0000-000000000001', 'be200000-0000-0000-0000-000000000103', null),
  ('be200000-0000-0000-0000-000000000001', 'be200000-0000-0000-0000-000000000104', null),
  ('be200000-0000-0000-0000-000000000001', 'be200000-0000-0000-0000-000000000105', null),
  ('be200000-0000-0000-0000-000000000001', 'be200000-0000-0000-0000-000000000107', null),
  ('be200000-0000-0000-0000-000000000001', 'be200000-0000-0000-0000-000000000108', now()),
  ('be200000-0000-0000-0000-000000000002', 'be200000-0000-0000-0000-000000000106', null);

insert into public.outfits (id, user_id, item_ids, source) values
  ('be200000-0000-0000-0000-000000000201', 'be200000-0000-0000-0000-000000000001',
    '["be200000-0000-0000-0000-000000000101","be200000-0000-0000-0000-000000000102","be200000-0000-0000-0000-000000000103"]', 'engine'),
  ('be200000-0000-0000-0000-000000000202', 'be200000-0000-0000-0000-000000000002',
    '["be200000-0000-0000-0000-000000000106","be200000-0000-0000-0000-000000000102","be200000-0000-0000-0000-000000000103"]', 'engine');
insert into public.outfit_items (outfit_id, wardrobe_item_id, slot, position) values
  ('be200000-0000-0000-0000-000000000201', 'be200000-0000-0000-0000-000000000101', 'base_layer', 0),
  ('be200000-0000-0000-0000-000000000201', 'be200000-0000-0000-0000-000000000102', 'bottom', 1),
  ('be200000-0000-0000-0000-000000000201', 'be200000-0000-0000-0000-000000000103', 'footwear', 2),
  ('be200000-0000-0000-0000-000000000202', 'be200000-0000-0000-0000-000000000106', 'base_layer', 0),
  ('be200000-0000-0000-0000-000000000202', 'be200000-0000-0000-0000-000000000102', 'bottom', 1),
  ('be200000-0000-0000-0000-000000000202', 'be200000-0000-0000-0000-000000000103', 'footwear', 2);

create temp table parent_before as
select to_jsonb(o) as outfit,
  (select jsonb_agg(to_jsonb(oi) order by oi.position) from public.outfit_items oi where oi.outfit_id = o.id) as items
from public.outfits o where o.id = 'be200000-0000-0000-0000-000000000201';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'be200000-0000-0000-0000-000000000001', true);
select set_config('be2.swap_id', public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201',
  'be200000-0000-0000-0000-000000000101',
  'be200000-0000-0000-0000-000000000104',
  'successful-swap'
)::text, true);

select pg_temp.assert_true((select source = 'swap' and parent_outfit_id = 'be200000-0000-0000-0000-000000000201'
  and generator_version = 'deterministic-swap-v1' from public.outfits where id = current_setting('be2.swap_id')::uuid),
  'new outfit links its immutable parent and records swap provenance');
select pg_temp.assert_true((select count(*) = 3 from public.outfit_items where outfit_id = current_setting('be2.swap_id')::uuid),
  'new outfit has complete relational membership');
select pg_temp.assert_true((select array_agg(wardrobe_item_id order by position) = array[
  'be200000-0000-0000-0000-000000000104'::uuid,
  'be200000-0000-0000-0000-000000000102'::uuid,
  'be200000-0000-0000-0000-000000000103'::uuid]
  from public.outfit_items where outfit_id = current_setting('be2.swap_id')::uuid),
  'only the selected item is replaced and positions are preserved');
select pg_temp.assert_true((select count(*) = 1 from public.outfit_interactions
  where outfit_id = current_setting('be2.swap_id')::uuid and event_type = 'item_swapped'
    and item_id = 'be200000-0000-0000-0000-000000000101'
    and replacement_item_id = 'be200000-0000-0000-0000-000000000104'),
  'one item_swapped interaction records from and to items');
select pg_temp.assert_true(public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201',
  'be200000-0000-0000-0000-000000000101',
  'be200000-0000-0000-0000-000000000104',
  'successful-swap') = current_setting('be2.swap_id')::uuid,
  'idempotent replay returns the original child');
select pg_temp.assert_true((select count(*) = 1 from public.outfits
  where user_id = 'be200000-0000-0000-0000-000000000001' and source = 'swap'),
  'idempotent replay creates no duplicate child');

select pg_temp.expect_error($q$select public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201','be200000-0000-0000-0000-000000000102',
  'be200000-0000-0000-0000-000000000104','successful-swap')$q$, '22023');
select pg_temp.expect_error($q$select public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000202','be200000-0000-0000-0000-000000000106',
  'be200000-0000-0000-0000-000000000104','foreign-parent')$q$, '42501');
select pg_temp.expect_error($q$select public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201','be200000-0000-0000-0000-000000000104',
  'be200000-0000-0000-0000-000000000101','not-a-member')$q$, '22023');
select pg_temp.expect_error($q$select public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201','be200000-0000-0000-0000-000000000101',
  'be200000-0000-0000-0000-000000000105','wrong-role')$q$, '22023');
select pg_temp.expect_error($q$select public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201','be200000-0000-0000-0000-000000000101',
  'be200000-0000-0000-0000-000000000106','foreign-replacement')$q$, '22023');
select pg_temp.expect_error($q$select public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201','be200000-0000-0000-0000-000000000101',
  'be200000-0000-0000-0000-000000000107','draft-replacement')$q$, '22023');
select pg_temp.expect_error($q$select public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201','be200000-0000-0000-0000-000000000101',
  'be200000-0000-0000-0000-000000000108','retired-replacement')$q$, '22023');
select pg_temp.expect_error($q$select public.record_outfit_interaction(
  'be200000-0000-0000-0000-000000000201','item_swapped','forged-swap')$q$, '22023');

select pg_temp.expect_error($q$select public.create_swapped_outfit(
  'be200000-0000-0000-0000-000000000201','be200000-0000-0000-0000-000000000101',
  'be200000-0000-0000-0000-000000000104','rollback-key')$q$, 'P0001');
select pg_temp.assert_true((select count(*) = 1 from public.outfits
  where user_id = 'be200000-0000-0000-0000-000000000001' and source = 'swap'),
  'event failure rolls back the child outfit and memberships');

reset role;
select pg_temp.assert_true((select outfit = to_jsonb(o) and items =
  (select jsonb_agg(to_jsonb(oi) order by oi.position) from public.outfit_items oi where oi.outfit_id = o.id)
  from parent_before cross join public.outfits o where o.id = 'be200000-0000-0000-0000-000000000201'),
  'original outfit and membership remain unchanged');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.create_swapped_outfit(uuid,uuid,uuid,text)', 'execute'),
  'anonymous callers cannot execute swap RPC');
select pg_temp.assert_true(not has_function_privilege('authenticated', 'public.wardrobe_item_slot(text,text,text,text)', 'execute'),
  'normalization helper is not exposed to clients');
select pg_temp.expect_error($q$insert into public.outfit_interactions
  (user_id,outfit_id,event_type,idempotency_key) values
  ('be200000-0000-0000-0000-000000000001','be200000-0000-0000-0000-000000000201','item_swapped','missing-items')$q$, '23514');
select pg_temp.expect_error($q$insert into public.outfit_interactions
  (user_id,outfit_id,event_type,item_id,replacement_item_id,idempotency_key) values
  ('be200000-0000-0000-0000-000000000001','be200000-0000-0000-0000-000000000201','outfit_worn',
   'be200000-0000-0000-0000-000000000101','be200000-0000-0000-0000-000000000104','non-swap-items')$q$, '23514');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'be200000-0000-0000-0000-000000000002', true);
select pg_temp.assert_true((select count(*) = 0 from public.outfits where id = current_setting('be2.swap_id')::uuid),
  'cross-user child outfit read is denied by RLS');
select pg_temp.assert_true((select count(*) = 0 from public.outfit_interactions where idempotency_key = 'successful-swap'),
  'cross-user swap interaction read is denied by RLS');

rollback;
select 'PASS: deterministic immutable outfit swap transaction, idempotency, rollback and RLS tests';
