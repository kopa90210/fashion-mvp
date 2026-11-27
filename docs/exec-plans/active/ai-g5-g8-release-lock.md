# G5–G8 release lock — 2026-11-25

Scope: PR #12, fix/phase6-p0-reliability-cloud only. No main, PR #13, or production mutation.
G5 baseline 05bb4a3: CI 45667006113 and dependency audit 45667006117 passed.
ENABLE_METERED_SHOPPER_AI must remain OFF in production. Founder-authorized exception (2026-11-25): isolated PR #12 staging preview may enable G4/G5/G6 for authenticated product validation using free-tier APIs. No public rollout, production promotion, or production environment changes until G7/G8 are verified. Advanced observability and production pricing are deferred, not waived. Catalog fixtures must be distinguished from verified retailer facts. No premature G5 refactor in G6.
G6: ENABLE_WARDROBE_INTELLIGENCE and ENABLE_STYLE_TRANSFORMATION default off; independently enforced server-side. Existing ledger components; Groq primary, Gemini secondary, deterministic fallback. Facts deterministic; target style read-only; no product links.
## Mandatory launch blockers
- G7/G8: durable per-request maximum 3 provider reservations across all components and retries; deny before provider invocation, including concurrent requests; cache compatibility keyed by validated wardrobe, catalog revision, target and model/prompt version; no stale or cross-user reuse.
- G7: measure real end-to-end and provider latency (p50/p95), attempts, fallback rate, actual token usage, pricing version, unknown cost and EGP/MAU. Call-count quotas alone do not prove <=1.10 EGP/MAU.
- P0 catalog: trusted feed or authorized validation job must establish in-stock status, fresh EGP price and valid product URL. Exclude stale, unavailable or unverified records; prove with fixtures and real retailer samples. Current JSON metadata is not independent verification.
- Coverage: keep fail-closed for rejected compatibility, improve pre-filtering before calls, provide actionable small-wardrobe and no-match UX without false shopping claims.
- G8: authenticated preview E2E of primary, secondary, both-fail, quota denial, replay and concurrent cases; verify source against ledger and actual outfit; check isolation, stale leases, privacy, security and rollback. G3–G6 live provider success is not established by CI.
- Production NO-GO until explicit gate report and release approval.
