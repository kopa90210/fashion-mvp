# Problem
Signup currently enters the quiz without a confirmed session.

# User Value
Clear email confirmation, useful expired-link and rate-limit messages, and a cookie session before entering the quiz.

# Current Repository State
Server actions use the existing Supabase SSR cookie client. No confirmation route or trusted origin configuration exists.

# Product Scope
MVP authentication repair. Preserve password login; no production deployment or hosted configuration changes.

# Proposed Architecture
Keep the existing cookie client for signup and OTP verification. Configure `APP_ORIGIN` on the server; never use request headers for emailed links.

# Data Flow
Signup → session: quiz; no session: check inbox → confirmation route → verify email OTP → session: quiz.

# API Contracts
`GET /auth/confirm?token_hash=...` always verifies type `email`. No arbitrary redirect destination. Failure redirects to signup with a fixed friendly message.

# Database Changes
None.

# Failure Modes
Expired/missing/invalid token, 429, no returned session, or invalid origin. No automatic email retries.

# Security
Never log tokens/passwords; exclude confirmation tokens from redirect URLs, caching, and referrers. Only server configuration controls email origin.

# Observability
Tests assert redirect outcomes and one call on rate limits. No raw auth-error logging added.

# Implementation Gates
Implement actions, confirmation route, and signup feedback; validate types, lint, and Vitest before completion.

# Tests
Pending signup, immediate session, OTP success, expired/invalid links, missing token, no session, 429, trusted origin, password login.

Validation: all 11 auth tests pass; `tsc --noEmit` passes. Full Vitest:
533 passed, 4 skipped, with an outfit-action timeout and an outfit benchmark
failure under concurrent load. Both affected files passed in isolation (35 tests).
Repository lint exits successfully with no errors. Seven warnings are in unchanged
files; the new test's unused import warning was removed. No live signup emails,
hosted configuration changes, or Production deployments were performed.

# Rollback
Revert the scoped auth changes. No schema changes.

# Validation Metric
Confirmed users reach quiz; pending users see inbox instructions; rate-limited requests make one call.
