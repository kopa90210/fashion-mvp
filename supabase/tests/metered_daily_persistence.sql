begin;
insert into auth.users(id,email) values ('c6030000-0000-4000-8000-000000000001','g3-test@security-test.invalid'),('c6030000-0000-4000-8000-000000000002','g3-other@security-test.invalid');
update public.users set timezone='UTC' where id in ('c6030000-0000-4000-8000-000000000001','c6030000-0000-4000-8000-000000000002');
insert into public.user_wardrobe_items(user_id,item_id)
select 'c6030000-0000-4000-8000-000000000001',id from (select distinct on(layer_role) id,layer_role from public.wardrobe_items where source='curated' and status='confirmed' and layer_role in ('base_layer','bottom','footwear') order by layer_role,id) s;
set local role service_role;
do $$
declare u uuid:='c6030000-0000-4000-8000-000000000001'; other uuid:='c6030000-0000-4000-8000-000000000002'; r uuid:=gen_random_uuid(); t uuid; ids jsonb; v_id uuid; bad uuid; denied boolean:=false;
begin
 select jsonb_agg(item_id order by item_id) into ids from public.user_wardrobe_items where user_id=u;
 if jsonb_array_length(ids)<>3 then raise exception 'fixture missing'; end if;
 t:=(public.begin_ai_decision(u,r,'daily_outfit',repeat('a',64))->>'token')::uuid;
 if not public.reserve_ai_attempt(u,r,'daily_outfit',t,1::smallint,'groq','test-model') then raise exception 'reserve'; end if;
 if not public.finish_ai_attempt(u,r,'daily_outfit',t,1::smallint,'accepted',100,20,0,100,null,null) then raise exception 'attempt'; end if;
 if public.finish_ai_decision(u,r,'daily_outfit',t,jsonb_build_object('item_ids',ids,'reasoning',jsonb_build_array('test'),'styling_tip',null)) is distinct from 'PRIMARY_AI' then raise exception 'source'; end if;
 v_id:=public.persist_metered_daily_outfit(u,r,(now() at time zone 'UTC')::date);
 if v_id is null or public.persist_metered_daily_outfit(u,r,(now() at time zone 'UTC')::date) is distinct from v_id then raise exception 'idempotency'; end if;
 if (select count(*) from public.outfit_items where outfit_id=v_id)<>3 then raise exception 'relational items'; end if;
 if not exists(select 1 from public.ai_decisions d join public.outfits o on o.id=d.outfit_id where d.user_id=u and d.request_id=r and d.source='PRIMARY_AI' and o.item_ids=ids and o.user_id=u) then raise exception 'ledger link'; end if;
 bad:=gen_random_uuid(); t:=(public.begin_ai_decision(other,bad,'daily_outfit',repeat('b',64))->>'token')::uuid;
 perform public.finish_ai_decision(other,bad,'daily_outfit',t,jsonb_build_object('item_ids',ids,'reasoning','[]'::jsonb));
 begin perform public.persist_metered_daily_outfit(other,bad,(now() at time zone 'UTC')::date); exception when raise_exception then denied:=true; end;
 if not denied then raise exception 'foreign ownership accepted'; end if;
end $$;
reset role;
select 'G3 persistence rollback assertions passed' as result;
rollback;