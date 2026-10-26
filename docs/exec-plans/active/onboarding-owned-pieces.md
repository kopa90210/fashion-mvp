# Problem
Curated onboarding choices currently create style seeds only. The selection UI asks for style preference and forces minimum categories, while calibration feedback marks completion without an ownership commit.

# User Value
Users can confirm examples of clothes they own, including an empty choice, and see those clothes in their wardrobe and eligible daily outfits after calibration.

# Current Repository State
`PieceSelectionScreen.tsx` saves `user_style_seed_items` through `saveWardrobeSelection`; `submit_calibration_feedback` sets `users.has_completed_calibration` after three answers. Daily deterministic, AI, and fallback paths use `user_wardrobe_items`. Historical style seeds cannot prove ownership. The named strategy and roadmap documents are absent from this checkout; `AGENTS.md` and code define the available constraints.

# Product Scope
The existing quiz, curated selection, calibration, wardrobe, and daily outfit flow only. No existing style seeds are backfilled into ownership.

# Proposed Architecture
A single per-user pending selection row stores explicit item IDs, a version, and commit state. Authenticated RPCs replace the pending set and finalize it. Both serialize on the row; finalization checks the version, validates curated confirmed items, inserts/reactivates memberships, and marks completion in one transaction. Calibration feedback remains style feedback only.

# Data Flow
Quiz → save pending selection → calibration style feedback → review current selection/count → finalize RPC → refresh wardrobe and outfits.

# API Contracts
`set_onboarding_owned_selection(uuid[], integer)` returns the next version. `finalize_onboarding_owned_selection(integer)` returns count and completion state. The server derives identity with `auth.uid()`; callers provide no owner ID.

# Database Changes
Forward-only migration creates `onboarding_owned_selections` with owner-only read and RPC-only writes, replaces calibration completion behavior, and adds transactional finalization.

# Failure Modes
Invalid or retired curated items reject the whole operation. Stale versions reject finalization. Retry after a lost response reads committed state and returns the same completion. Empty selections commit zero items. Failed writes leave calibration pending.

# Security
No direct authenticated writes to ownership or pending state. RPCs use `auth.uid()`, fixed search path, explicit grants, and row locks.

# Observability
Log finalization errors with request context on the server; do not log item details or user wardrobe contents.

# Implementation Gates
1. Migration and RLS tests. 2. Server actions. 3. Selection and completion UX. 4. Daily outfit refresh and regression tests.

# Tests
Type check, lint, focused Vitest, and disposable local Postgres migration/RLS checks. Report any gate that cannot run.

# Rollback
Revert application use of the new RPCs. Leave the forward migration and existing committed memberships intact; never reinterpret historical style seeds.

# Validation Metric
Selection completion, calibration completion, owned-item visibility, and first daily outfit eligibility for users with enough confirmed pieces.
