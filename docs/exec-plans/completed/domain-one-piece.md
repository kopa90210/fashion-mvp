# Status
Completed on 2026-10-05. Application validation passed: 332 frontend tests (4 skipped), 132 Python tests, ESLint with zero errors, and `tsc --noEmit`. Migration `20261005180000_domain_one_piece.sql` was applied to local Supabase only, recorded in the local ledger, and `supabase/tests/domain_one_piece.sql` passed through local `psql` with all fixtures rolled back.

# Problem
StyleGraph has no canonical `one_piece` category or role. Dresses and jumpsuits are either rejected or silently mapped to tops, while every outfit path assumes separates.

# User Value
Users can calibrate and receive daily recommendations from dresses, jumpsuits, rompers, and gowns without pretending those garments are tops or requiring a bottom.

# Current Repository State
TypeScript and Python taxonomies omit `one_piece`; the deterministic engines require base layer, bottom, and footwear; quiz selection requires every separates category; database category, slot, creation, AI completion, and swap rules enforce separates only; the notebook outfit normalizer maps dress and jumpsuit labels to top.

# Product Scope
Add one canonical category and role, two deterministic outfit archetypes, global calibration eligibility, persistence support, flat-lay positioning, and regression tests. No scoring preference, provider retry, mask, or unrelated UX changes.

# Proposed Architecture
Use a reusable pure structural-validity helper in application recommendation code and an equivalent immutable SQL helper for database-owned functions. Both accept exactly one separates core or exactly one one-piece core, plus optional outerwear and accessory.

# Data Flow
Extraction or curated selection -> canonical normalization -> owned/proxy wardrobe -> archetype-aware deterministic recommendation -> validated relational outfit persistence -> daily/calibration presentation.

# API Contracts
`WardrobeCategory` and curated `attributes.category` add `one_piece`; layer roles and relational slots add `one_piece`. Existing request shapes remain unchanged.

# Database Changes
Create a new migration that replaces the named category/slot checks while preserving existing values, adds a pure slot-array validity function, and updates active outfit creation, AI completion, and immutable swap functions.

# Failure Modes
Reject missing footwear, mixed one-piece and separates cores, duplicate roles, incomplete separates, one-piece-only looks, invalid remote categories, and selections that cannot build either calibration archetype.

# Security
Retain `auth.uid()` ownership checks, security-definer search paths, grants, RLS, and transactional swap/idempotency behavior. Apply only to local Supabase.

# Observability
No new telemetry. Existing outfit source, job, and interaction logging remains unchanged.

# Implementation Gates
Taxonomy and normalization; engine and validity helper; quiz eligibility; actions/flat lay; Python normalization and engine; migration and SQL tests; complete TypeScript/Python/local database validation.

# Tests
Both outfit archetypes, optional roles, mixed invalid structures, missing footwear, dual-archetype ranking, deterministic order, textual normalization, curated contract/cache acceptance, calibration eligibility, local migration, existing values, SQL outfit creation, and swap compatibility.

# Rollback
Revert application code and the new migration before ingesting any one-piece rows. After one-piece data exists, rollback requires migrating those rows deliberately rather than deleting them.

# Validation Metric
Two dresses plus two footwear items can produce calibration outfits; one owned dress plus footwear can produce a daily outfit; separates continue to produce the same deterministic recommendations.
