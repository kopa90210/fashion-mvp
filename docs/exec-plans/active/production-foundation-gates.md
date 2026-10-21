# Production Foundation Gates

## Problem

The local StyleGraph MVP needs a verified baseline and staged production hardening for ownership, private media, relational outfits, transactional feedback, durable AI work, recommendation attribution, and CI/documentation.

## User Value

Protect private wardrobe data, prevent duplicate or inconsistent recommendations and feedback, preserve reliable fallbacks, and make product quality measurable without expanding beyond the MVP.

## Current Repository State

- Local workspace: `F:\project\autofashion`.
- Starting commit: `f976b4a4c3ed7ccadcac90e35947bb81eda6882d`.
- Existing modified/untracked files are user work and must be preserved.
- Gate 0 validates the actual local state before schema or behavior changes.

## Product Scope

In scope: wardrobe reliability, private uploads, AI extraction infrastructure, daily outfits, feedback, Fashion DNA, quality attribution, tests, and documentation.

Out of scope: commerce, marketplace, social features, virtual try-on, advanced ML infrastructure, and new microservices.

## Proposed Architecture

Keep the modular Next.js application, Supabase/PostgreSQL, and stateless FastAPI AI boundary. PostgreSQL owns durable invariants. External model calls remain outside interactive browser requests. The deterministic recommendation engine remains the fallback.

## Data Flow

Browser → Next.js authenticated backend → PostgreSQL/private storage. Durable AI jobs are claimed by a bounded worker → FastAPI/provider → validated result → PostgreSQL. Recommendation display and feedback are attributed through relational records.

## API Contracts

Contract changes will be introduced only in the gate that owns them and will include consumer updates and tests. AI responses remain untrusted and are validated before persistence.

## Database Changes

- Gate 1: canonical join-table ownership and migration-history validation.
- Gate 2: private `media_assets` and signed-URL access.
- Gate 3: relational `outfit_items`, daily uniqueness, and user timezone.
- Gate 4: idempotent `preference_events` and versioned Fashion DNA.
- Gate 5: durable `ai_jobs` and `ai_runs`.
- Gate 6: `recommendation_impressions`.
- All changes use new forward-only migrations.

## Failure Modes

Migration-history conflicts, ambiguous ownership, legacy public media, malformed outfit IDs, duplicate daily generation, concurrent feedback, stale AI claims, provider errors, and missing local database tooling must be reported rather than hidden.

## Security

RLS independently enforces ownership. Secrets never enter source, logs, reports, or browser bundles. Private media requires authorization or short-lived signed URLs. SECURITY DEFINER functions use fixed search paths and narrow grants.

## Observability

Track source, request/job correlation, provider/model/prompt/schema versions, validation outcome, fallback use, latency, and safe error codes without raw secrets or unnecessary user data.

## Implementation Gates

1. Gate 0 — verified local baseline.
2. Gate 1 — canonical ownership and migration model.
3. Gate 2 — private media and safe upload.
4. Gate 3 — relational outfits and daily idempotency.
5. Gate 4 — transactional feedback and Fashion DNA versions.
6. Gate 5 — durable AI jobs and observability.
7. Gate 6 — recommendation attribution.
8. Gate 7 — CI, full validation, and documentation.

Only one gate is implemented at a time. Each gate must pass or receive an explicit documented exception before the next gate begins.

## Tests

Use lint, TypeScript checking, Vitest, production build, Pytest, focused contract tests, migration replay, disposable-database/RLS tests, and concurrency tests as applicable. Record only commands actually run.

## Rollback

Prefer feature flags, compatibility reads, reversible application routing, and additive schema changes. Do not remove legacy columns or public media until backfills and compatibility checks pass.

## Validation Metric

Gate-specific correctness and security tests plus product metrics: upload completion, extraction success/correction, daily outfit validity/fallback rate, like rate by source/algorithm, and outfits unlocked.

## Current Status

Gate 0 application and tooling failures are repaired and verified; disposable
database replay still requires Docker and deterministic `0014` ledger evidence.
Gate 1 was approved but is paused at that mandatory migration-ledger check; see
`gate-1-ledger-blocker.md`. Gates 2–7 are pending.
