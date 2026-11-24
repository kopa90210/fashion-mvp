-- Run against staging with an authorized administrative connection. Read-only.
select count(*) as attempts,
 count(*) filter(where status='reserved') as reserved,
 count(*) filter(where status='reserved' and created_at<now()-interval '30 seconds') as stale_reserved,
 count(*) filter(where status='success') as success,
 count(*) filter(where status not in ('reserved','success')) as failures,
 count(*) filter(where estimated_cost_usd is null) as unknown_cost,
 sum(estimated_cost_usd) as known_cost_usd,
 percentile_cont(0.95) within group(order by latency_ms) as provider_p95_ms
from public.stylist_ai_telemetry where created_at>=now()-interval '24 hours';
select (select count(*) from public.stylist_ai_requests where state='running' and lease_until<now()) as expired_running,
 (select coalesce(sum(used_count),0) from public.stylist_global_quota_windows where quota_type='gemini_daily' and window_start=date_trunc('day',now(),'UTC')) as today_attempts,
 (select coalesce(sum(used_count),0) from public.stylist_global_quota_windows where quota_type='gemini_monthly' and window_start=date_trunc('month',now(),'UTC')) as month_attempts;
