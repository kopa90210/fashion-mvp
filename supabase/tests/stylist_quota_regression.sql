-- Administrative staging only; rollback fixtures. Requires at least 10 global allowances remaining.
begin;
insert into auth.users(id,email) values('c6010000-0000-4000-8000-000000000001','p006-quota@security-test.invalid');
set local role service_role;
do $$ declare u uuid:='c6010000-0000-4000-8000-000000000001'; i int; r jsonb; k uuid:=gen_random_uuid(); before_day int; before_month int;
begin
for i in 1..20 loop if not public.reserve_stylist_quota(u,'api_hourly') then raise exception 'hourly early denial'; end if; end loop;
if public.reserve_stylist_quota(u,'api_hourly') then raise exception 'hourly overshoot'; end if;
select coalesce(sum(used_count),0) into before_day from public.stylist_global_quota_windows where quota_type='gemini_daily' and window_start=date_trunc('day',now(),'UTC');
select coalesce(sum(used_count),0) into before_month from public.stylist_global_quota_windows where quota_type='gemini_monthly' and window_start=date_trunc('month',now(),'UTC');
r:=public.begin_stylist_ai_metered(u,k,repeat('a',64),'test-model');
if r->>'status'<>'claimed' then raise exception 'claim failed'; end if;
if public.begin_stylist_ai_metered(u,k,repeat('a',64),'test-model')->>'status'<>'busy' then raise exception 'duplicate allowed'; end if;
if public.begin_stylist_ai_metered(u,gen_random_uuid(),repeat('a',64),'test-model')->>'status'<>'busy' then raise exception 'overlap allowed'; end if;
if not public.finish_stylist_ai_metered(u,k,(r->>'token')::uuid,null,'timeout',null,null,null,5000,null,null) then raise exception 'finish failed'; end if;
if public.begin_stylist_ai_metered(u,k,repeat('a',64),'test-model')->>'status'<>'completed' then raise exception 'replay failed'; end if;
for i in 2..10 loop if not public.reserve_stylist_quota(u,'gemini_daily') then raise exception 'daily early denial'; end if; end loop;
if public.reserve_stylist_quota(u,'gemini_daily') then raise exception 'daily overshoot'; end if;
if (select used_count from public.stylist_global_quota_windows where quota_type='gemini_daily' and window_start=date_trunc('day',now(),'UTC'))<>before_day+10 then raise exception 'daily atomicity failed'; end if;
if (select used_count from public.stylist_global_quota_windows where quota_type='gemini_monthly' and window_start=date_trunc('month',now(),'UTC'))<>before_month+10 then raise exception 'monthly atomicity failed'; end if;
end $$;
select 'P0-06 sequential quota assertions passed' as result;
rollback;
