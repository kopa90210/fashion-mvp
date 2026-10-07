# Problem
Outfit-photo review exposes multiple forms instead of one focused clothing decision.

# User Value
Review main clothing first, then optionally accessories, with explicit control over ownership.

# Current Repository State
Existing private signed images, polling, metadata update, individual confirm and discard actions are reusable. The review contract contains no style labels.

# Product Scope
One garment at a time, mobile-first imagery, plain-language processing, a details sheet and main-piece checkpoint. No bulk confirmation.

# Proposed Architecture
Client-only presentation and ordering helper; existing server actions unchanged.

# Data Flow
Poll photo review; sort pending drafts; edit metadata; individually confirm or discard; optionally review accessories; return to wardrobe.

# API Contracts
Unchanged.

# Database Changes
None.

# Failure Modes
Friendly mutation errors retain the current piece. Poll failures retain results and continue checking. Navigation does not cancel processing.

# Security
Preserve signed images and existing authenticated actions. Never automatically confirm drafts.

# Observability
No new logging or backend changes.

# Implementation Gates
Focused review, details sheet, checkpoint and processing states; tests and lint.

# Tests
Ordering, handled-draft filtering, processing copy and rendered states; full npm test and lint plus TypeScript check.

# Rollback
Revert only this iteration's frontend files.

# Validation Metric
Review completion and time to confirm a garment; no instrumentation added in this iteration.

# Completed Validation
- Implemented focused main-piece review, details sheet, explicit main-piece checkpoint, optional accessories and completion states.
- Preserved signed image renewal, polling, individual metadata/confirm/discard actions and alternate-image compatibility. No backend contracts or bulk confirmation changed.
- Added 10 ordering and rendered-state regression tests.
- Full suite: 232 passed, 4 skipped; final run used one worker. Earlier parallel runs intermittently exceeded the existing outfit-engine timing budget; engine and budget unchanged.
- Repository lint: zero errors, two existing unused-variable warnings in doc/doc-filelist.js and doc/doc-script.js. Changed review files have zero warnings.
- TypeScript and git diff --check passed.
- Browser interaction/visual testing was not performed.
