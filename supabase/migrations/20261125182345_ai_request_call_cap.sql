-- Serialize reservations across components of the same user/request.
-- Count all charged attempts, including failed, expired and in-flight attempts.
-- No refund on provider failure; quota-denied records do not consume allowance.
create or replace function public.reserve_ai_attempt(p_user_id uuid,p_request_id uuid,p_component text,p_token uuid,p_slot smallint,p_provider text,p_model text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.ai_decisions%rowtype; allowed boolean; charged integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ai-request-cap:v1:'||p_user_id::text||':'||p_request_id::text,0));
 select * into d from public.ai_decisions where user_id=p_user_id and request_id=p_request_id and component=p_component for update;
 if not found or d.claim_token is distinct from p_token or d.source is not null or d.lease_until<=clock_timestamp() then return false; end if;
 if exists(select 1 from public.ai_provider_attempts where user_id=p_user_id and request_id=p_request_id and component=p_component and (slot=p_slot or status in ('reserved','accepted'))) then return false; end if;
 if p_slot=1 and exists(select 1 from public.ai_provider_attempts where user_id=p_user_id and request_id=p_request_id and component=p_component and slot=2) then return false; end if;
 select count(*) into charged from public.ai_provider_attempts where user_id=p_user_id and request_id=p_request_id and status<>'quota_denied';
 allowed:=false;
 if charged<3 then allowed:=public.reserve_stylist_quota(p_user_id,'gemini_daily'); end if;
 insert into public.ai_provider_attempts(user_id,request_id,component,slot,provider,model,status,completed_at)
 values(p_user_id,p_request_id,p_component,p_slot,p_provider,p_model,case when allowed then 'reserved' else 'quota_denied' end,case when allowed then null else clock_timestamp() end);
 return allowed;
end $$;
revoke all on function public.reserve_ai_attempt(uuid,uuid,text,uuid,smallint,text,text) from public,anon,authenticated;
grant execute on function public.reserve_ai_attempt(uuid,uuid,text,uuid,smallint,text,text) to service_role;

