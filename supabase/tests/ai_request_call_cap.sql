begin;
insert into auth.users(id,email) values('c6070000-0000-4000-8000-000000000001','g7-cap-test@security-test.invalid');
set local role service_role;
do $$
declare u uuid:='c6070000-0000-4000-8000-000000000001'; r uuid:=gen_random_uuid(); t uuid; c text; n integer;
begin
 t:=(public.begin_ai_decision(u,r,'stylist_intent',repeat('a',64))->>'token')::uuid;
 if not public.reserve_ai_attempt(u,r,'stylist_intent',t,1::smallint,'gemini','test-model') then raise exception 'first'; end if;
 if public.reserve_ai_attempt(u,r,'stylist_intent',t,1::smallint,'gemini','test-model') then raise exception 'duplicate'; end if;
 if not public.finish_ai_attempt(u,r,'stylist_intent',t,1::smallint,'timeout',null,null,null,10,null,null) then raise exception 'timeout'; end if;
 if not public.reserve_ai_attempt(u,r,'stylist_intent',t,2::smallint,'groq','test-model') then raise exception 'second'; end if;
 if not public.finish_ai_attempt(u,r,'stylist_intent',t,2::smallint,'accepted',1,1,0,10,null,null) then raise exception 'accepted'; end if;
 if public.finish_ai_decision(u,r,'stylist_intent',t,'{}') is distinct from 'SECONDARY_AI' then raise exception 'source'; end if;
 t:=(public.begin_ai_decision(u,r,'daily_finds',repeat('b',64))->>'token')::uuid;
 if not public.reserve_ai_attempt(u,r,'daily_finds',t,1::smallint,'groq','test-model') then raise exception 'third'; end if;
 if not public.finish_ai_attempt(u,r,'daily_finds',t,1::smallint,'provider_error',null,null,null,10,null,null) then raise exception 'failure'; end if;
 if public.reserve_ai_attempt(u,r,'daily_finds',t,2::smallint,'gemini','test-model') then raise exception 'fourth'; end if;
 if public.finish_ai_decision(u,r,'daily_finds',t,'{}') is distinct from 'DETERMINISTIC_FALLBACK' then raise exception 'fallback'; end if;
 t:=(public.begin_ai_decision(u,r,'unlock_compatibility',repeat('c',64))->>'token')::uuid;
 if public.reserve_ai_attempt(u,r,'unlock_compatibility',t,1::smallint,'groq','test-model') then raise exception 'fifth'; end if;
 if public.reserve_ai_attempt(u,r,'unlock_compatibility',t,2::smallint,'gemini','test-model') then raise exception 'sixth'; end if;
 if public.finish_ai_decision(u,r,'unlock_compatibility',t,'{}') is distinct from 'DETERMINISTIC_ONLY' then raise exception 'rules source'; end if;
 select count(*) into n from public.ai_provider_attempts where user_id=u and request_id=r and status<>'quota_denied';
 if n<>3 then raise exception 'charged count %',n; end if;
 select used_count into n from public.stylist_quota_windows where user_id=u and quota_type='gemini_daily' and window_start=date_trunc('day',now(),'UTC');
 if n is distinct from 3 then raise exception 'daily charge count %',n; end if;
 r:=gen_random_uuid();t:=(public.begin_ai_decision(u,r,'wardrobe_analysis',repeat('d',64))->>'token')::uuid;
 if not public.reserve_ai_attempt(u,r,'wardrobe_analysis',t,1::smallint,'groq','test-model') then raise exception 'independent request'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.reserve_ai_attempt(uuid,uuid,text,uuid,smallint,text,text)','execute') or has_function_privilege('anon','public.reserve_ai_attempt(uuid,uuid,text,uuid,smallint,text,text)','execute') then raise exception 'public execution'; end if;
end $$;
select 'G7 request cap sequential rollback assertions passed' as result;
rollback;
