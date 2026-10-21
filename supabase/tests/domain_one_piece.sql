-- Execute only on local Supabase. Fixtures and created outfits roll back.
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

select pg_temp.assert_true(public.is_valid_outfit_slots(array['base_layer','bottom','footwear']), 'separates remain valid');
select pg_temp.assert_true(public.is_valid_outfit_slots(array['one_piece','footwear']), 'one-piece core is valid');
select pg_temp.assert_true(public.is_valid_outfit_slots(array['one_piece','footwear','outerwear','accessory']), 'one-piece optional roles are valid');
select pg_temp.assert_true(not public.is_valid_outfit_slots(array['one_piece']), 'one-piece without footwear is invalid');
select pg_temp.assert_true(not public.is_valid_outfit_slots(array['one_piece','bottom','footwear']), 'mixed core is invalid');
select pg_temp.assert_true(not public.is_valid_outfit_slots(array['base_layer','bottom']), 'separates without footwear are invalid');
select pg_temp.assert_true(public.wardrobe_item_slot(null, 'midi dress', 'Blue midi dress', null) = 'one_piece', 'dress text maps to one_piece');
select pg_temp.assert_true(public.wardrobe_item_slot('outerwear', 'dress coat', 'Dress coat', null) = 'outerwear', 'explicit category wins');

insert into auth.users (id, email) values ('c1000000-0000-0000-0000-000000000001', 'one-piece@local.test');
insert into public.users (id) values ('c1000000-0000-0000-0000-000000000001') on conflict do nothing;
insert into public.fashion_dna (user_id, vector) values ('c1000000-0000-0000-0000-000000000001', '{"minimal":0.8}')
on conflict (user_id) do update set vector = excluded.vector;

insert into public.wardrobe_items
  (id, category, subcategory, display_name, image_url, layer_role, source, status, style_tags)
values
  ('c1000000-0000-0000-0000-000000000101', 'one_piece', 'midi dress', 'Blue midi dress', '/c1/dress.png', 'one_piece', 'user_upload', 'confirmed', '{"minimal":0.8}'),
  ('c1000000-0000-0000-0000-000000000102', 'footwear', 'heels', 'Black heels', '/c1/shoes.png', 'footwear', 'user_upload', 'confirmed', '{"minimal":0.7}'),
  ('c1000000-0000-0000-0000-000000000103', 'one_piece', 'jumpsuit', 'Black jumpsuit', '/c1/jumpsuit.png', 'one_piece', 'user_upload', 'confirmed', '{"minimal":0.9}'),
  ('c1000000-0000-0000-0000-000000000104', 'bottom', 'skirt', 'Skirt', '/c1/skirt.png', 'bottom', 'user_upload', 'confirmed', '{"minimal":0.6}'),
  ('c1000000-0000-0000-0000-000000000105', 'top', 'shirt', 'Shirt', '/c1/shirt.png', 'base_layer', 'user_upload', 'confirmed', '{"minimal":0.6}');

insert into public.user_wardrobe_items (user_id, item_id)
select 'c1000000-0000-0000-0000-000000000001', id from public.wardrobe_items where id::text like 'c1000000-%';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-0000-0000-000000000001', true);
select set_config('c1.one_piece_outfit', public.create_outfit_with_items(
  array['c1000000-0000-0000-0000-000000000101'::uuid, 'c1000000-0000-0000-0000-000000000102'::uuid],
  'engine'
)::text, true);
select pg_temp.assert_true((select array_agg(slot order by position) = array['one_piece','footwear']
  from public.outfit_items where outfit_id = current_setting('c1.one_piece_outfit')::uuid),
  'one-piece outfit persists complete relational slots');
select pg_temp.assert_true(public.create_outfit_with_items(
  array['c1000000-0000-0000-0000-000000000105'::uuid, 'c1000000-0000-0000-0000-000000000104'::uuid,
        'c1000000-0000-0000-0000-000000000102'::uuid], 'engine') is not null,
  'existing separates remain valid');
select pg_temp.expect_error($q$select public.create_outfit_with_items(array[
  'c1000000-0000-0000-0000-000000000101'::uuid,'c1000000-0000-0000-0000-000000000104'::uuid,
  'c1000000-0000-0000-0000-000000000102'::uuid], 'engine')$q$, '22023');

select set_config('c1.swapped_outfit', public.create_swapped_outfit(
  current_setting('c1.one_piece_outfit')::uuid,
  'c1000000-0000-0000-0000-000000000101',
  'c1000000-0000-0000-0000-000000000103',
  'one-piece-swap'
)::text, true);
select pg_temp.assert_true((select parent_outfit_id = current_setting('c1.one_piece_outfit')::uuid
  from public.outfits where id = current_setting('c1.swapped_outfit')::uuid),
  'one-piece swap creates an immutable child');

reset role;
select pg_temp.assert_true((select count(*) >= 1 from public.wardrobe_items where category = 'top'), 'existing category values remain valid');
select pg_temp.assert_true((select count(*) = 2 from public.outfit_items where outfit_id = current_setting('c1.one_piece_outfit')::uuid), 'one-piece outfit contains two items');

rollback;
select 'PASS: canonical one-piece taxonomy and both outfit archetypes';
