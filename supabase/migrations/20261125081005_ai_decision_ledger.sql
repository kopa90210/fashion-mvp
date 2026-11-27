-- Shared AI decision ledger. Existing gemini_* quota buckets are retained as
-- aggregate provider-call counters for compatibility with the legacy stylist RPC.
create table public.ai_decisions (
 user_id uuid not null references auth.users(id) on delete cascade,
 request_id uuid not null,
 component text not null check (component in ('daily_outfit','calibration','stylist_intent','stylist_selection','daily_finds','unlock_compatibility','wardrobe_analysis','style_transformation','explanation','photo_extraction')),
 fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
 claim_token uuid not null default gen_random_uuid(),
 lease_until timestamptz not null default (now()+interval '60 seconds'),
 source text check (source in ('PRIMARY_AI','SECONDARY_AI','DETERMINISTIC_FALLBACK','DETERMINISTIC_ONLY','UNAVAILABLE')),
 result jsonb check (result is null or octet_length(result::text)<=16384),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 primary key(user_id,request_id,component),
 check ((source is null) = (completed_at is null)),
 check (source is not null or result is null),
 check (source is distinct from 'UNAVAILABLE' or result is null)
);
create table public.ai_provider_attempts (
 user_id uuid not null,
 request_id uuid not null,
 component text not null,
 slot smallint not null check(slot in (1,2)),
 provider text not null check(provider in ('groq','gemini')),
 model text not null check(model ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,119}$'),
 status text not null check(status in ('reserved','quota_denied','accepted','timeout','provider_error','invalid_output')),
 input_tokens integer check(input_tokens>=0),
 output_tokens integer check(output_tokens>=0),
 thought_tokens integer check(thought_tokens>=0),
 latency_ms integer check(latency_ms>=0),
 pricing_version text check(length(pricing_version) between 1 and 80),
 estimated_cost_usd numeric(18,9) check(estimated_cost_usd>=0 and estimated_cost_usd<1000000000),
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 primary key(user_id,request_id,component,slot),
 foreign key(user_id,request_id,component) references public.ai_decisions(user_id,request_id,component) on delete cascade,
 check ((status='reserved') = (completed_at is null)),
 check ((pricing_version is null) = (estimated_cost_usd is null))
);
alter table public.ai_decisions enable row level security;
alter table public.ai_provider_attempts enable row level security;
revoke all on public.ai_decisions,public.ai_provider_attempts from public,anon,authenticated;
grant select,insert,update on public.ai_decisions,public.ai_provider_attempts to service_role;

create function public.begin_ai_decision(p_user_id uuid,p_request_id uuid,p_component text,p_fingerprint text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.ai_decisions%rowtype;
begin
 insert into public.ai_decisions(user_id,request_id,component,fingerprint)
 values(p_user_id,p_request_id,p_component,p_fingerprint)
 on conflict do nothing returning * into d;
 if found then return jsonb_build_object('status','claimed','token',d.claim_token); end if;
 select * into strict d from public.ai_decisions where user_id=p_user_id and request_id=p_request_id and component=p_component for update;
 if d.fingerprint is distinct from p_fingerprint then return '{"status":"conflict"}'::jsonb; end if;
 if d.source is not null then
  return jsonb_build_object('status','completed','source',d.source,'result',d.result,'attempts',
   coalesce((select jsonb_agg(jsonb_build_object('slot',a.slot,'provider',a.provider,'model',a.model,'status',a.status,'latencyMs',a.latency_ms) order by a.slot) from public.ai_provider_attempts a where a.user_id=p_user_id and a.request_id=p_request_id and a.component=p_component),'[]'::jsonb));
 end if;
 if d.lease_until<=clock_timestamp() then return '{"status":"expired"}'::jsonb; end if;
 return '{"status":"busy"}'::jsonb;
end $$;

create function public.reserve_ai_attempt(p_user_id uuid,p_request_id uuid,p_component text,p_token uuid,p_slot smallint,p_provider text,p_model text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.ai_decisions%rowtype; allowed boolean;
begin
 select * into d from public.ai_decisions where user_id=p_user_id and request_id=p_request_id and component=p_component for update;
 if not found or d.claim_token is distinct from p_token or d.source is not null or d.lease_until<=clock_timestamp() then return false; end if;
 if exists(select 1 from public.ai_provider_attempts where user_id=p_user_id and request_id=p_request_id and component=p_component and (slot=p_slot or status in ('reserved','accepted'))) then return false; end if;
 if p_slot=1 and exists(select 1 from public.ai_provider_attempts where user_id=p_user_id and request_id=p_request_id and component=p_component and slot=2) then return false; end if;
 -- Both providers share the existing aggregate limits; no extra budget on fallback.
 allowed := public.reserve_stylist_quota(p_user_id,'gemini_daily');
 insert into public.ai_provider_attempts(user_id,request_id,component,slot,provider,model,status,completed_at)
 values(p_user_id,p_request_id,p_component,p_slot,p_provider,p_model,case when allowed then 'reserved' else 'quota_denied' end,case when allowed then null else clock_timestamp() end);
 return allowed;
end $$;

create function public.finish_ai_attempt(p_user_id uuid,p_request_id uuid,p_component text,p_token uuid,p_slot smallint,p_status text,p_input integer,p_output integer,p_thought integer,p_latency integer,p_pricing_version text,p_cost numeric)
returns boolean language plpgsql security invoker set search_path='' as $$
declare d public.ai_decisions%rowtype;
begin
 if p_status is null or p_status not in ('accepted','timeout','provider_error','invalid_output') then raise exception 'Invalid attempt status'; end if;
 select * into d from public.ai_decisions where user_id=p_user_id and request_id=p_request_id and component=p_component for update;
 if not found or d.claim_token is distinct from p_token or d.source is not null or d.lease_until<=clock_timestamp() then return false; end if;
 update public.ai_provider_attempts set status=p_status,input_tokens=p_input,output_tokens=p_output,thought_tokens=p_thought,latency_ms=p_latency,pricing_version=p_pricing_version,estimated_cost_usd=p_cost,completed_at=clock_timestamp()
 where user_id=p_user_id and request_id=p_request_id and component=p_component and slot=p_slot and status='reserved';
 return found;
end $$;

create function public.finish_ai_decision(p_user_id uuid,p_request_id uuid,p_component text,p_token uuid,p_result jsonb)
returns text language plpgsql security invoker set search_path='' as $$
declare d public.ai_decisions%rowtype; v_source text; accepted_slot smallint;
begin
 select * into d from public.ai_decisions where user_id=p_user_id and request_id=p_request_id and component=p_component for update;
 if not found or d.claim_token is distinct from p_token or d.source is not null or d.lease_until<=clock_timestamp() then return null; end if;
 if exists(select 1 from public.ai_provider_attempts where user_id=p_user_id and request_id=p_request_id and component=p_component and status='reserved') then return null; end if;
 select slot into accepted_slot from public.ai_provider_attempts where user_id=p_user_id and request_id=p_request_id and component=p_component and status='accepted';
 if accepted_slot is not null and (p_result is null or p_result='null'::jsonb) then raise exception 'Accepted result required'; end if;
 if p_result is null or p_result='null'::jsonb then v_source:='UNAVAILABLE'; p_result:=null;
 elsif accepted_slot=1 then v_source:='PRIMARY_AI';
 elsif accepted_slot=2 then v_source:='SECONDARY_AI';
 elsif exists(select 1 from public.ai_provider_attempts where user_id=p_user_id and request_id=p_request_id and component=p_component and status<>'quota_denied') then v_source:='DETERMINISTIC_FALLBACK';
 else v_source:='DETERMINISTIC_ONLY'; end if;
 update public.ai_decisions set source=v_source,result=p_result,completed_at=clock_timestamp() where user_id=p_user_id and request_id=p_request_id and component=p_component;
 return v_source;
end $$;

revoke all on function public.begin_ai_decision(uuid,uuid,text,text),public.reserve_ai_attempt(uuid,uuid,text,uuid,smallint,text,text),public.finish_ai_attempt(uuid,uuid,text,uuid,smallint,text,integer,integer,integer,integer,text,numeric),public.finish_ai_decision(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.begin_ai_decision(uuid,uuid,text,text),public.reserve_ai_attempt(uuid,uuid,text,uuid,smallint,text,text),public.finish_ai_attempt(uuid,uuid,text,uuid,smallint,text,integer,integer,integer,integer,text,numeric),public.finish_ai_decision(uuid,uuid,text,uuid,jsonb) to service_role;
