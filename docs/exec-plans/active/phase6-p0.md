# Phase 6 P0 — quota integration

Status: implementation candidate, not release-approved.
Base: feat/stylist-gemini-search (d03b189). Isolated cloud branch; do not merge or promote to production.

## Decisions
- PostgreSQL fixed UTC windows: 20 API calls/hour/user, 10 Gemini attempts/day/user.
- Reserve API quota after validation/authentication and before loading wardrobe.
- Reserve Gemini quota only for eligible Ask requests with a nonempty wardrobe and provider key.
- API denial returns 429; Gemini denial returns deterministic rules. RPC failure returns generic 503, no model call. Provider failures retain quota; no application retry.
- The server-only client uses the same public project URL as auth, with SUPABASE_SECRET_KEY (preferred), SUPABASE_SERVICE_KEY, or SUPABASE_SERVICE_ROLE_KEY. Never use an anon key for quota or expose a server key. Verify matching staging credentials before enabling the flag.
- Wardrobe reads remain on the user-scoped client. Do not use the privileged quota client for wardrobe access.

## Evidence and migration reconciliation
- Staging project xaxwzncbvmxicbnvjfad: migration 20261124140505_stylist_quota applied via Supabase management API. This file preserves the ledger's SQL. RLS enabled, anon/authenticated access denied, service role allowed.
- Sequential staging test: 10/11 Gemini reservations accepted; rollback left zero rows. Not concurrency evidence.
- Previous staging migrations have management-generated versions that differ from original repository filenames. Do not run an unreviewed linked db push or repair the ledger blindly.
- Prior local baseline: 572 passing tests, four skipped, build passed; seven lint warnings. npm audit: 29 vulnerabilities, including two critical; investigate separately.
- Cloud CI checks candidate code without real provider or database credentials; staging E2E remains separate.

## Outstanding release blockers
- Verify CI results, independent real concurrent DB reservations, API staging E2E and matching deployment environment.
- Verified monetary spend ceiling, idempotency, per-user in-flight lease, token/cost telemetry, retention/cleanup of counters.
- Review existing database advisor findings and dependency audit. Keep production frozen.
- Rollback: disable ENABLE_STYLIST in staging, revert app changes if needed; leave additive quota table until migration removal is explicitly reviewed.

## P0-02 evidence (2026-11-24)
- Prior CI run 45411300369 succeeded.
- Staging migration 20261124143226_stylist_global_quota replaces the existing reservation RPC, preserving its signature. Global UTC day/month caps: 100/3000 attempts. Individual cap: 10/day. API cap unchanged.
- Month/day/user lock order and exception subtransaction rollback all reservations on quota denial. Unexpected errors propagate; existing API falls back on false and fails closed on RPC errors.
- Live sequential assertions passed for individual, global daily and global monthly exhaustion, rollback of preceding counters, and independent API availability. All test writes rolled back; zero persisted quota rows. RLS and restricted execution verified.
- Limits are call-count ceilings for stylist classification only, not a verified billing cap. Existing historical usage is not backfilled; staging had zero prior Gemini quota rows at preflight. Before production, assess cutover accounting, concurrent sessions, idempotency, telemetry and environment isolation. No production migration or merge.

## P0-02B evidence (2026-11-24)
- Previous CI run 45415431354 succeeded.
- Staging migration 20261124144117_stylist_ai_idempotency adds service-only request records and begin/finish RPCs. Transaction-scoped per-user advisory lock serializes claim/finish decisions. Claim atomically reserves all Gemini allowances; a 30-second lease blocks a different active request. Expired same-key claims become terminal rules fallback, never re-executed. Completion requires a matching live claim token.
- Ask requires a UUID Idempotency-Key header. Browser retains it for retry of an identical body within the mounted component; a successful result or changed body begins a new operation. API rate limit still counts HTTP attempts. Cache stores a SHA-256 fingerprint and validated structured intent, not raw questions or final wardrobe/product recommendations; current wardrobe and catalog are recomputed on replay.
- Actual rolled-back staging assertions passed: claim, duplicate/different-key busy, payload conflict, invalid completion token, successful completion, replay without extra global reservation, expired claim terminalization, rejection of expired completion, new claim after expiry. RLS/permissions verified and zero request/global rows persisted.
- Remaining: separate-session race test, staging browser E2E, latest CI, retention/cleanup and privacy review, legacy preview builds can still call old quota RPC without lease, process pauses or ambiguous provider execution beyond lease can overlap a later request; no exactly-once provider guarantee. Keep production frozen. No deployment or production changes authorized.
