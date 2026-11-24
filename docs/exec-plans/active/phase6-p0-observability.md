# P0-05 stylist observability — 2026-11-24
Scope: isolated PR #12, staging only. P0-04 CI run 45459955931 passed at 942fd15.
Request events: stylist.request schemaVersion 1; view, HTTP status, bounded outcome, AI path, failure stage, end-to-end and stage latency. No request body, identity, credentials or exception messages. One event per handled request; process crashes can prevent emission.
AI attempt metrics remain in service-only stylist_ai_telemetry. SQL: supabase/tests/stylist_health_report.sql.
Actual staging snapshot: last 24h attempts/reserved/stale/success/failures/unknown-cost all 0; known cost and provider p95 null; expired running 0; UTC day/month attempts 0. No traffic; no measured reliability or costs.
Proposed beta alerts (not configured): API p95 >8000 ms over at least 30 completed requests; unexpected provider fallback >5% of live provider attempts over at least 30 attempts; 503 >2% of at least 50 eligible requests; stale reserved or expired running >0; quota utilization >=80%; unknown-cost completed attempts >0. Exclude intentional daily rules from fallback denominator. Cached-null-or-quota cannot distinguish quota denial from previous null result. Verify real logs, retention, alert routing and provider pricing before release.
No production changes, no manual deployment. Latest CI and hosted staging log ingestion remain unverified at report creation.
