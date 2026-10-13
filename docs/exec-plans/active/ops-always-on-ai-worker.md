# Problem

Outfit-photo jobs depend on a manually started worker, so otherwise valid uploads can remain queued indefinitely.

# User Value

Every upload is claimed automatically by a continuously supervised worker without changing extraction behavior.

# Current Repository State

The worker already claims PostgreSQL jobs atomically with `FOR UPDATE SKIP LOCKED` and a lease. It lacks an explicit production process definition, startup validation, lifecycle logs, heartbeats, and graceful signal handling.

# Product Scope

Operational reliability only. AI providers, prompts, queue schema, concurrency, recommendation behavior, and UI remain unchanged.

# Proposed Architecture

Run `python -m ai_service.worker` as a dedicated Railway service using `Dockerfile.worker`. Railway owns restart supervision; the worker owns polling, sanitized health logs, and graceful draining.

# Data Flow

The existing flow remains: PostgreSQL queue → atomic lease claim → selected provider → existing completion RPC.

# API Contracts

No API contract changes.

# Database Changes

None. Existing leases provide crash recovery and prevent simultaneous claims.

# Failure Modes

- Missing configuration: fail startup with a non-zero exit and variable names only.
- Job/provider failure: record through the existing job completion path and continue polling.
- Fatal loop/process failure: exit so Railway restarts the service.
- SIGTERM/SIGINT: stop claiming, finish the current synchronous job, close the HTTP client, exit.

# Security

Logs contain worker identity, provider name, timing, and timestamps only. Secrets and image/user payloads are excluded.

# Observability

Emit `WORKER_STARTED`, periodic `WORKER_HEARTBEAT`, shutdown request, and `WORKER_STOPPED`. Heartbeats include the last claim and successful completion timestamps.

# Implementation Gates

1. Test lifecycle and configuration behavior.
2. Add a dedicated worker container/process definition.
3. Verify local startup, continuous polling, claim safety, and crash recovery.
4. Deploy a separate Railway service and verify three fresh uploads without manual restarts.

# Tests

Focused pytest worker tests, the relevant AI-service suite, TypeScript typecheck, and diff whitespace validation.

# Rollback

Remove the dedicated worker service and revert the worker lifecycle wrapper. No database rollback is required.

# Validation Metric

Three fresh outfit uploads are automatically claimed and reach reviewable drafts while one worker instance remains continuously running.
