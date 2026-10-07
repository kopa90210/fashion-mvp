# Problem
Style likes/dislikes cannot represent viewing, wearing or deferring an outfit without corrupting preference semantics.

# User Value
Provide an auditable foundation for future behavioral controls with actual persistence.

# Current Repository State
Preference feedback has its own idempotent RPC, feedback rows and Fashion DNA versions. Local Supabase is running and contains the required outfit/user tables.

# Product Scope
Separate viewed/worn/not-today ledger and two authenticated server actions. No swap, frontend wiring, preference updates or recommendation changes.

# Proposed Architecture
New table with owner-select RLS and explicit grants. Authenticated security-definer RPC checks ownership, context and request identity. Unique user/key handles concurrent retries; mismatched replays fail.

# Data Flow
Authenticated action → owner-checking RPC → separate behavioral row. No user identity is accepted from the caller.

# API Contracts
recordOutfitWorn/recordOutfitNotToday return { interactionId }. RPC returns a UUID. Idempotency keys are nonblank and at most 200 characters.

# Database Changes
One new migration with outfit_interactions, FK/index/validation constraints, owner read policy and record_outfit_interaction. Optional item references reserved but unset by initial RPC. Existing migrations unchanged.

# Failure Modes
Unauthenticated/foreign outfit requests rejected. Invalid event/context/key rejected. Identical replay returns the original UUID; different payload with the same key is rejected. Concurrent outfit deletion/ownership change is blocked during recording by a shared row lock.

# Security
Authenticated RPC only; no direct client DML. Authenticated SELECT scoped by auth.uid(). Pinned search_path and fully qualified relations. Caller context remains untrusted. Local Supabase only, no environment/remote connection configuration used.

# Observability
Durable interaction identity and timestamps; no private request logging.

# Implementation Gates
Migration and actions, local two-user SQL/RLS tests, concurrent replay test, full TypeScript tests/lint/types.

# Tests
Owner worn/not-today/viewed, foreign and unauthenticated rejection, duplicate and mismatched replay, invalid inputs, direct-write denial, owner/cross-user reads, unchanged feedback/DNA snapshots and concurrent idempotency.

# Rollback
Remove application callers before reversing the new migration in a controlled environment. No changes to existing preference state to undo.

# Validation Metric
Ledger persistence success and retry deduplication; no UI or analytics added.

# Completed Validation
- Applied and registered `20261005160000_outfit_interactions.sql` on local Supabase only. No remote migrations were pushed.
- `python scripts/test_outfit_interactions_local.py` passed transactional authorization/RLS/input-validation tests and concurrent duplicate-request tests. The runner permits local Docker sockets only.
- Owner reads and all three allowed events passed; cross-user and unauthenticated access, direct client writes, invalid inputs and mismatched idempotency replays were rejected.
- Existing `liked=true` feedback and Fashion DNA snapshots remained unchanged. Concurrent identical requests returned one persisted interaction and the same UUID.
- Ten focused server-action test cases were added. `npm test -- --maxWorkers=1`: 295 passed, 4 skipped, zero failures across 19 files.
- `npm run lint`: zero errors, two existing warnings in `doc/doc-filelist.js` and `doc/doc-script.js`. `npx tsc --noEmit` and `git diff --check` passed.
- No frontend controls, swap events, recommendation changes or preference-behavior changes were introduced.
