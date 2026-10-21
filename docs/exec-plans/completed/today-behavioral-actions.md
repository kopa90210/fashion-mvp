# Problem
The Today screen has persisted style preference controls but no persisted way to record wearing or deferring a personal wardrobe outfit.

# User Value
Let users record a real Today decision while keeping that decision distinct from whether they like the outfit's style.

# Current Repository State
Personal and inspiration looks are already distinguished using confirmed-owned item IDs. BE-1 provides authenticated `recordOutfitWorn` and `recordOutfitNotToday` actions backed by the separate interaction ledger. Preference controls use `submitOutfitFeedback` and update Fashion DNA.

# Product Scope
Add wear and not-today controls to personal wardrobe mode only, with confirmation, recoverable failures and rapid-click protection. Preserve Love this/Not my style behavior. No swap or automatic replacement after not-today.

# Proposed Architecture
Call the existing behavioral server actions directly from the client screen. Keep behavioral request/status state separate from preference feedback state. Use deterministic keys derived from event type and persisted outfit ID.

# Data Flow
Personal Today outfit → explicit behavioral control → BE-1 server action → owner-checking interaction RPC. Style feedback remains on its existing independent action and persistence path.

# API Contracts
No contract changes. Wear and not-today actions receive the outfit UUID and a stable idempotency key and return an interaction ID.

# Database Changes
None. Uses the existing BE-1 migration.

# Failure Modes
Disable both behavior controls while a request is active and after a successful Today decision. On failure, show safe copy, release the lock and allow retry. Do not replace the outfit after not-today.

# Security
Controls appear only when all shown pieces are confirmed-owned. Server actions and RPC continue to authenticate and prove outfit ownership.

# Observability
No new logs. The durable interaction row records event identity and time.

# Implementation Gates
Focused screen edit and tests proving action separation, deterministic keys, click protection and retry recovery; then full tests, lint and type checking.

# Tests
Wear calls only its behavioral action; not-today calls only its behavioral action; both preference choices call feedback only; double clicks issue one request; failed behavior calls can retry.

# Rollback
Remove the Today behavioral controls and their client state. BE-1 remains safely unused.

# Validation Metric
Successful persisted wear/not-today decisions without changing preference feedback or Fashion DNA.

# Completed Validation
- Personal Today mode now presents the outfit identity, primary wear decision, secondary not-today decision, explanation and independent style preference controls in that order. Inspiration/proxy looks do not expose ownership behavior controls.
- Wear calls only `recordOutfitWorn`; not-today calls only `recordOutfitNotToday`. Stable keys use `today:<event>:<outfit-id>` and do not include mutable client state.
- Successful wear decisions show `Locked in`. Successful not-today decisions explain that the event is a Today decision rather than a style dislike and do not fetch another outfit.
- An immediate request lock protects both actions from rapid double clicks. Safe failures release the lock and allow a retry.
- Love this and Not my style retain the existing `submitOutfitFeedback` behavior. Behavioral controls never call it and do not change Fashion DNA.
- Focused Today and BE-1 action tests passed: 25 tests. The final full suite passed 301 tests with 4 skipped across 19 files.
- `npm run lint` passed with zero errors and two existing unused-variable warnings in `doc/doc-filelist.js` and `doc/doc-script.js`. `npx tsc --noEmit` passed.
- No database, recommendation, calibration, swap or automatic not-today replacement behavior was changed.
