create table public.stylist_daily_research (
 user_id uuid primary key references auth.users(id) on delete cascade,
 fingerprint text not null check(fingerprint ~ '^[0-9a-f]{64}$'),
 token uuid not null,
 state text not null check(state in ('running','completed','failed')),
 lease_until timestamptz not null,
 expires_at timestamptz not null,
 result jsonb,
 updated_at timestamptz not null default now(),
 check(result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=65536))
);
alter table public.stylist_daily_research enable row level security;
revoke all on public.stylist_daily_research from public,anon,authenticated;
grant select,insert,update,delete on public.stylist_daily_research to service_role;
create function public.claim_stylist_research(p_user_id uuid,p_fingerprint text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r public.stylist_daily_research%rowtype; t uuid:=gen_random_uuid(); n timestamptz:=now();
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user_id::text,63721));
 select * into r from public.stylist_daily_research where user_id=p_user_id;
 if found then
  if r.state='running' and r.lease_until>n then return jsonb_build_object('status','busy'); end if;
  if r.fingerprint=p_fingerprint and r.state='completed' and r.expires_at>n then return jsonb_build_object('status','completed','result',r.result,'checkedAt',r.updated_at); end if;
  if r.state='failed' and r.expires_at>n then return jsonb_build_object('status','busy'); end if;
 end if;
 insert into public.stylist_daily_research(user_id,fingerprint,token,state,lease_until,expires_at,result,updated_at)
 values(p_user_id,p_fingerprint,t,'running',n+interval '5 minutes',n,null,n)
 on conflict(user_id) do update set fingerprint=excluded.fingerprint,token=excluded.token,state=excluded.state,lease_until=excluded.lease_until,expires_at=excluded.expires_at,result=null,updated_at=n;
 return jsonb_build_object('status','claimed','token',t);
end $$;
create function public.finish_stylist_research(p_user_id uuid,p_token uuid,p_result jsonb,p_ttl_seconds integer) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update public.stylist_daily_research set state=case when p_result is null then 'failed' else 'completed' end,
 result=p_result,updated_at=now(),expires_at=now()+make_interval(secs=>least(21600,greatest(60,p_ttl_seconds)))
 where user_id=p_user_id and token=p_token and state='running' and lease_until>now();
 return found;
end $$;
revoke all on function public.claim_stylist_research(uuid,text) from public,anon,authenticated;
revoke all on function public.finish_stylist_research(uuid,uuid,jsonb,integer) from public,anon,authenticated;
grant execute on function public.claim_stylist_research(uuid,text) to service_role;
grant execute on function public.finish_stylist_research(uuid,uuid,jsonb,integer) to service_role;
