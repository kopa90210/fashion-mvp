begin;
insert into auth.users(id,email) values('c6020000-0000-4000-8000-000000000001','g2-ledger-test@security-test.invalid');
set local role service_role;
do $$
declare u uuid:='c6020000-0000-4000-8000-000000000001'; r uuid:='c6020000-0000-4000-8000-000000000002'; t uuid; v jsonb; n integer;
begin
 v:=public.begin_ai_decision(u,r,'daily_outfit',repeat('a',64)); t:=(v->>'token')::uuid;
 if v->>'status'<>'claimed' or t is null then raise exception 'claim failed'; end if;
 if public.begin_ai_decision(u,r,'daily_outfit',repeat('a',64))->>'status'<>'busy' then raise exception 'duplicate claim'; end if;
 if public.begin_ai_decision(u,r,'daily_outfit',repeat('b',64))->>'status'<>'conflict' then raise exception 'fingerprint'; end if;
 if public.reserve_ai_attempt(u,r,'daily_outfit',gen_random_uuid(),1::smallint,'groq','test-model') then raise exception 'wrong token'; end if;
 if not public.reserve_ai_attempt(u,r,'daily_outfit',t,1::smallint,'groq','test-model') then raise exception 'primary reservation'; end if;
 if public.reserve_ai_attempt(u,r,'daily_outfit',t,1::smallint,'groq','test-model') then raise exception 'duplicate reservation'; end if;
 if public.reserve_ai_attempt(u,r,'daily_outfit',t,2::smallint,'gemini','test-model') then raise exception 'parallel secondary'; end if;
 if public.finish_ai_decision(u,r,'daily_outfit',t,'{}') is not null then raise exception 'unfinished attempt'; end if;
 if not public.finish_ai_attempt(u,r,'daily_outfit',t,1::smallint,'timeout',null,null,null,3500,null,null) then raise exception 'finish primary'; end if;
 if not public.reserve_ai_attempt(u,r,'daily_outfit',t,2::smallint,'gemini','test-model') then raise exception 'secondary reservation'; end if;
 if not public.finish_ai_attempt(u,r,'daily_outfit',t,2::smallint,'accepted',100,20,0,500,'test-v1',0.000012) then raise exception 'finish secondary'; end if;
 if public.finish_ai_decision(u,r,'daily_outfit',t,'{"item_ids":[]}') is distinct from 'SECONDARY_AI' then raise exception 'source'; end if;
 v:=public.begin_ai_decision(u,r,'daily_outfit',repeat('a',64));
 if v->>'source'<>'SECONDARY_AI' or jsonb_array_length(v->'attempts')<>2 or v->'result' is distinct from '{"item_ids":[]}'::jsonb then raise exception 'replay'; end if;
 select used_count into n from public.stylist_quota_windows where user_id=u and quota_type='gemini_daily' and window_start=date_trunc('day',now(),'UTC');
 if n is distinct from 2 then raise exception 'shared quota %',n; end if;
 for i in 1..8 loop
  if not public.reserve_stylist_quota(u,'gemini_daily') then raise exception 'fill quota'; end if;
 end loop;
 r:=gen_random_uuid(); v:=public.begin_ai_decision(u,r,'stylist_selection',repeat('c',64)); t:=(v->>'token')::uuid;
 if public.reserve_ai_attempt(u,r,'stylist_selection',t,1::smallint,'groq','test-model') then raise exception 'quota bypass'; end if;
 if public.reserve_ai_attempt(u,r,'stylist_selection',t,2::smallint,'gemini','test-model') then raise exception 'secondary quota bypass'; end if;
 if public.finish_ai_decision(u,r,'stylist_selection',t,'{}') is distinct from 'DETERMINISTIC_ONLY' then raise exception 'quota provenance'; end if;
end $$;
reset role;
do $$ begin
 if has_table_privilege('authenticated','public.ai_decisions','select') or has_table_privilege('anon','public.ai_provider_attempts','select') or has_function_privilege('authenticated','public.begin_ai_decision(uuid,uuid,text,text)','execute') then raise exception 'public access'; end if;
end $$;
select 'G2 ledger rollback assertions passed' as result;
rollback;
