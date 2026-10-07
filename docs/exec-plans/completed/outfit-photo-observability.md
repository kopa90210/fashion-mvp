# Problem
Outfit-photo failures and latency cannot currently be localized to a stage.

# User Value
Diagnose the working Gemini Track A pipeline without exposing private media.

# Current Repository State
`feat/outfit-gemini-v2` contains the working provider and worker. Source reads,
Gemini retries, segmentation and uploads run synchronously. Garment processing
and uploads are interleaved; completion is an existing atomic RPC. The worker's
existing persisted latency excludes completion, and that contract stays intact.

# Product Scope
Logging/timing only. No changes to prompts, models, retries, provider selection,
normalization, masks, fallback, API responses or business decisions.

# Proposed Architecture
A small job-local observation context shares timing and stage information
between the worker and provider without changing provider signatures or state.
Python logging emits allowlisted fields as JSON plus a stable event name.

# Data Flow
Claim -> source fetch -> provider attempts -> segmentation/upload loop -> RPC.
The context resets after provider extraction, including exceptions.

# API Contracts
Unchanged. Observations are not added to jobs, garments or RPC payloads.

# Database Changes
None.

# Failure Modes
Keep failure classification, retry delays, cleanup and exception behavior.
Log failure stages without exception contents. Never report completion after
a failed RPC. Sum upload times across garments without reordering work.

# Security
Allowlist fields; exclude credentials, headers, user IDs, paths, URLs, image
bytes, base64, raw provider output and exception messages/tracebacks.

# Observability
Emit the twelve requested events. Durations use `time.monotonic()`.
Provider latency includes all Gemini attempts and existing backoff. Persistence
latency sums Storage network time and completion RPC time. Garment processing
duration covers decoding/normalization/rendering/PNG preparation minus upload
network time. Total latency starts after claim and ends after completion.
An uninstrumented fallback provider is measured across its extraction call.

# Implementation Gates
Review actual stage boundaries; add instrumentation; verify logs and unchanged
requests, retries, cleanup, failure outcomes and completion payloads.

# Tests
Focused caplog tests with deterministic clocks, plus the full AI pytest suite.

Completed validation on 2026-10-04 using the repository's existing `.venv`:
- Focused observability, worker and Gemini regressions: 29 passed, 1 warning.
- Full `python -m pytest ai_service/tests -q`: 96 passed, 2 dependency warnings,
  zero failures. All 81 existing tests remain green; 15 focused tests were added.
- Verified unchanged request/retry behavior, safe failure classification,
  partial-upload cleanup, completion payload fields and persisted latency scope.
- All twelve event names are covered; aggregate timing/count/byte checks and
  private-data sentinel checks passed.

# Rollback
Revert observability additions; no data migration or runtime contract changes.

# Validation Metric
A job ID links all stages; timings and aggregate byte/count values are present,
and private sentinel values never appear in captured application logs.
