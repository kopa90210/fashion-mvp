# Problem
Today's outfit competes with dashboard cards and preference weights; icon-only reactions obscure their meaning.

# User Value
Make one style preference decision around a large outfit with clear, independent explanations.

# Current Repository State
Daily feedback already persists likes/dislikes with idempotency and optimistic DNA updates. Calibration has its own flow. Daily reads can include curated proxies. The screen contract does not expose the stored timezone.

# Product Scope
Today header, dominant outfit, garment-based identity, independent reasons, Not my style/Love this actions, secondary collapsible DNA and visible Today/Wardrobe navigation. No weather, calendar, wear behavior or algorithm changes.

# Proposed Architecture
Reuse FlatLay with an opt-in editorial presentation, existing reasons and feedback handler. Classify visible looks against the existing authenticated confirmed-owned read; incomplete ownership means clearly labelled inspiration. Preserve calibration redirect and persistence logic.

# Data Flow
Existing daily outfit + DNA + confirmed-owned IDs → presentation → unchanged submitOutfitFeedback calls and next-outfit loading. No new persistence.

# API Contracts
No backend changes. Client presentation adds owned IDs and an optional FlatLay visual flag.

# Database Changes
None.

# Failure Modes
Existing feedback rollback and retry remain intact; present a friendly failure. Empty state links to real clothing uploads. Missing reasons receive honest empty copy. Unknown ownership is never labelled as a personal wardrobe look.

# Security
Reuse authenticated reads and signed images. No technical exceptions or user identities shown.

# Observability
No new tracking or logging.

# Implementation Gates
Presentation-only edits; calibration preserved; reasons and ownership distinction tested; feedback actions remain unchanged; full tests/lint/types.

# Tests
Today layout, independent reasons, truthful proxy copy, visible navigation, calibration redirect, owned-ID propagation, no unsupported controls and empty state. Existing action persistence tests retained.

# Rollback
Revert UX-4A presentation files; backend behavior is unchanged.

# Validation Metric
Preference feedback completion and Today engagement; instrumentation deferred.

# Completed Validation
- Today now prioritizes editorial FlatLay, garment-based identity, independent reasons and explicit Not my style/Love this preference controls.
- Owned looks and inspiration looks are labelled using the existing confirmed-owned read. No outfit selection, ranking, feedback persistence or calibration redirect was changed.
- Preserved existing idempotency key, optimistic vector update, feedback count, rollback, dislike next-outfit loading and liked completion flow. Errors display friendly copy.
- Fashion DNA is collapsed below the primary decision. Navigation visibly reads Today/Wardrobe. No wear, weather, calendar or Plan controls added.
- Shared explanation component was updated in place; calibration keeps default FlatLay styling and its existing feedback logic.
- Date omitted because the current screen contract does not expose the stored timezone safely.
- Added 11 presentation, ownership-copy, persisted action-binding and page-orchestration tests.
- Final full suite: 285 passed, 4 skipped using one worker for existing timing-sensitive benchmark tests.
- Repository lint: zero errors, two existing doc/ unused-variable warnings. Changed files are clean.
- TypeScript and git diff --check passed; outfit backend actions and calibration source have no diff.
- Browser visual/interaction testing was not performed.
