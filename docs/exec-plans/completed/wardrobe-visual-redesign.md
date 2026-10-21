# Problem
The wardrobe presents curated bootstrap data alongside ownership and uses editing-oriented cards with placeholder controls.

# User Value
Browse confirmed personal clothes through imagery, search, meaningful filters and a dedicated item page.

# Current Repository State
Wardrobe reads filter status but not source. Curated selection links share the wardrobe association table. No item detail route exists. Wishlist, drafts, photo sessions and individual/bulk actions are reusable.

# Product Scope
Owned confirmed uploads only in the main grid. Responsive 2/3/4 columns; category tabs; search; category/subcategory/color/style filters; newest/oldest/name sort; compact recent uploads. Preserve calibration separately.

# Proposed Architecture
Add a source constraint to the existing wardrobe read without changing its response shape. Pure client filtering and sorting. Authenticated item detail route reuses that owned read and existing mutation actions.

# Data Flow
Authenticated owned wardrobe read and signed previews → browser filters → item navigation or bulk selection. Drafts and photo sessions retain separate review access.

# API Contracts
Existing action shapes and canonical categories unchanged.

# Database Changes
None. No migration, RLS, recommendation or calibration changes.

# Failure Modes
Friendly empty/no-match and mutation failure states. Never label curated items as ownership. Missing private previews retain their cards.

# Security
Keep authenticated reads, existing RLS and private signed previews. Detail lookup must use the same owned pool and reject unavailable IDs.

# Observability
No new tracking or backend logging.

# Implementation Gates
Ownership regression coverage; real controls; separate drafts/uploads; working detail navigation; full tests, lint and types.

# Tests
Mixed-source ownership reads, search fields, combined filters, actual filter values, sorting, card navigation, responsive grid, sessions and empty states.

# Rollback
Revert only UX-2 files and the wardrobe-read source restriction.

# Validation Metric
Time to find an owned piece and successful item navigation; instrumentation deferred.

# Completed Validation
- Primary wardrobe read now requires source=user_upload and status=confirmed, with an inner relation and defensive source/status filtering. Public response shape is unchanged. Curated calibration data is retained.
- Implemented on-page search, real category/subcategory/color/style filters, newest/oldest/name sorting, responsive 2/3/4-column image-first cards and item navigation.
- Preserved wishlist, separate draft review, outfit-photo sessions, private previews and bulk removal. Draft view resets owned-grid selection.
- Added an authenticated owned-item detail route with explicit plain-language editing, replacement and removal using existing actions. Normal card taps never open an editor.
- Added 22 regression cases. Final full test run: 254 passed, 4 skipped using one worker to reduce existing timing-benchmark contention.
- Full repository lint: zero errors, two existing warnings in doc/doc-filelist.js and doc/doc-script.js; none in changed files.
- TypeScript and git diff --check passed.
- No browser visual/interaction test was performed. No recommendation engine, calibration, migrations or AI pipeline changed.
