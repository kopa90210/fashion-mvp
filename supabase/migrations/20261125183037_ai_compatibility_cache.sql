alter table public.ai_decisions add column compatibility_cache_origin uuid;
alter table public.ai_decisions add constraint ai_compatibility_cache_origin_check check(compatibility_cache_origin is null or (component='unlock_compatibility' and compatibility_cache_origin<>request_id and source in ('PRIMARY_AI','SECONDARY_AI')));
create index ai_compatibility_cache_lookup on public.ai_decisions(user_id,fingerprint,completed_at desc) where component='unlock_compatibility' and source in ('PRIMARY_AI','SECONDARY_AI') and compatibility_cache_origin is null;
create or replace function public.begin_cached_compatibility(p_user_id uuid,p_request_id uuid,p_fingerprint text,p_catalog_expires_at timestamptz)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare claim jsonb; origin public.ai_decisions%rowtype; current_decision public.ai_decisions%rowtype; cutoff timestamptz;
begin
 if p_catalog_expires_at is null or p_catalog_expires_at<=clock_timestamp() then return '{"status":"expired"}'::jsonb; end if;
 cutoff:=clock_timestamp()-interval '24 hours';
 claim:=public.begin_ai_decision(p_user_id,p_request_id,'unlock_compatibility',p_fingerprint);
 if claim->>'status'='claimed' then
  select * into origin from public.ai_decisions where user_id=p_user_id and component='unlock_compatibility' and fingerprint=p_fingerprint and request_id<>p_request_id and compatibility_cache_origin is null and source in ('PRIMARY_AI','SECONDARY_AI') and completed_at>cutoff and completed_at<=clock_timestamp() order by completed_at desc limit 1;
  if not found then return claim;end if;
  update public.ai_decisions set source=origin.source,result=origin.result,completed_at=clock_timestamp(),compatibility_cache_origin=origin.request_id where user_id=p_user_id and request_id=p_request_id and component='unlock_compatibility';
 elsif claim->>'status'='completed' then
  select * into current_decision from public.ai_decisions where user_id=p_user_id and request_id=p_request_id and component='unlock_compatibility';
  if current_decision.compatibility_cache_origin is null then
   if current_decision.completed_at<=cutoff then return '{"status":"expired"}'::jsonb;end if;
   return claim;
  end if;
  select * into origin from public.ai_decisions where user_id=p_user_id and request_id=current_decision.compatibility_cache_origin and component='unlock_compatibility' and fingerprint=p_fingerprint and completed_at>cutoff and completed_at<=clock_timestamp() and compatibility_cache_origin is null and source in ('PRIMARY_AI','SECONDARY_AI');
  if not found then return '{"status":"expired"}'::jsonb;end if;
 else return claim;
 end if;
 return jsonb_build_object('status','completed','source',origin.source,'result',origin.result,'cached',true,'attempts',coalesce((select jsonb_agg(jsonb_build_object('slot',a.slot,'provider',a.provider,'model',a.model,'status',a.status,'latencyMs',a.latency_ms) order by a.slot) from public.ai_provider_attempts a where a.user_id=p_user_id and a.request_id=origin.request_id and a.component='unlock_compatibility'),'[]'::jsonb));
end $$;
revoke all on function public.begin_cached_compatibility(uuid,uuid,text,timestamptz) from public,anon,authenticated;
grant execute on function public.begin_cached_compatibility(uuid,uuid,text,timestamptz) to service_role;

