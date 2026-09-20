# Gate 5 — durable AI jobs (local draft)

## Problem and user value

Interactive outfit requests should not wait on Groq. Photo extraction should survive request termination and expose a clear draft state. Bounded jobs and run history make failures diagnosable without storing raw model responses.

## Current repository state and scope

Gate 2–4 migrations remain local and unapplied. The request to work on Gate 5 is an exception to the normal gate sequence for **local implementation only**. No Gate 5 migration may be applied, marked applied, committed, or pushed as part of this draft. Gate 5 depends on Gate 2 `media_assets`, Gate 3 `outfit_items`, daily uniqueness, and timezone support, and Gate 4's feedback flow remains unchanged.

## Architecture and data flow

Next.js authenticates and writes private media, then authenticated RPCs enqueue extraction or daily generation. The daily request immediately returns a deterministic `engine` outfit. A separate Python CLI worker uses the service key to claim jobs and calls the existing Groq provider/validation service. One completion RPC writes a run, its validated result, and job state in one database transaction. `daily_ai` and `daily_fallback` stay distinct. The legacy direct-write CLI is dry-run only.

## API contracts and database changes

`enqueue_daily_outfit_job()` and `enqueue_wardrobe_extraction_job(uuid)` return an idempotent job ID. Service-only `claim_ai_jobs`, `complete_ai_job`, and `requeue_dead_ai_job` manage leases and recovery. The new migration adds `ai_jobs`, `ai_runs`, indexes, owner-read RLS, and run references from produced outfit/wardrobe rows. The worker requires `SUPABASE_SERVICE_KEY`, `GROQ_API_KEY`, and `GROQ_VISION_MODEL`; none belongs in a browser bundle.

## Failure modes, security, and observability

Claims use row locks and `SKIP LOCKED`. Expired leases become run records and are retried within `max_attempts`; permanent errors and exhausted attempts become dead letters. Completion rejects stale leases, cross-user outfit items, missing wardrobe roles, invalid confidence, and unavailable draft items. The worker reads only a private media asset owned by the job user **whose object path begins with that user's ID**. A `NOT VALID` check enforces that rule on new media rows; audit legacy rows and validate the constraint before production. It logs job ID and fixed safe codes, not provider responses or credentials. Runs record model, provider, prompt/schema versions, validation, latency, sanitized token usage, and safe error code. Manual dead-letter requeue is service-role only.

## Implementation gates and tests

1. Finish local TypeScript/Python tests, typecheck, lint, and static SQL review.
2. Once Gates 2–4 are deployed to a **disposable** database, apply Gate 5 there and prove: two simultaneous claims never return the same job; stale lease recovery; increasing bounded backoff; permanent error/dead-letter; service-only requeue; owner-read RLS; and run references on both outfit and extraction results.
3. Inspect a worker run with provider mocks, then review migration order and production rollout separately.

Mock tests do not prove PostgreSQL locking or RLS. Docker was unavailable during this local session, so disposable DB integration remains open.

## Rollback and validation metric

Keep `ENABLE_AI_DAILY_OUTFITS=false` until the worker is deployed and measured. Stop the worker to halt external AI calls; queued jobs remain durable. A production rollback needs a forward migration and should preserve audit rows. Measure queue latency, completion rate, retry/dead-letter rate, AI fallback rate, and extraction correction rate before treating this as product validation.
