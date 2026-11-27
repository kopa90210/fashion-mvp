# Temporary staging quota override

Applied 2026-11-26 to staging project `xaxwzncbvmxicbnvjfad` only; PR #12. Migration ledger version `20261126162437`, name `staging_only_temporary_quota_allowance`.

The existing `public.reserve_stylist_quota(uuid,text)` function was replaced in place. Only its user daily limit predicate changed from `q.used_count < 10` to `q.used_count < (CASE WHEN now() < timestamptz '2026-11-28 00:00:00+00' THEN 30 ELSE 10 END)`. Existing usage was retained. Global daily 100, monthly 3000, hourly API 20 and metered request cap 3 remain unchanged. Function execution remains denied to authenticated clients. The 30-call allowance applies to all staging users and shared Groq/Gemini reservations, not provider account quotas.

Expires automatically at 2026-11-28 00:00 UTC. No production migration is authorized. This document intentionally lives outside `supabase/migrations`. Before any future schema promotion, reconcile this staging-only ledger entry and restore the canonical function definition via reviewed staging migration; do not blindly push or repair the ledger. Verify function ACL, original limits, and request cap. Do not reset counters.

Evidence: CI and dependency audit at `83c0c8ce766445d07f8cc8707cd7bea237d92b44` passed; staging migration version and live function inspected on 2026-11-26. Functional shopper acceptance still pending.
