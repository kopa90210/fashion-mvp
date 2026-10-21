# Problem
An item page describes a garment without answering how to wear it.

# User Value
See complete looks using this owned piece and discover useful matches already in the wardrobe.

# Current Repository State
UX-2 added an authenticated owned item route and plain editing. The deterministic engine has bounded ranking but no anchoring constraint.

# Product Scope
Large hero, safe style descriptors, anchored looks, matches derived from ranked looks, Style this piece action and a consumer editing sheet. No AI generation, embeddings or automatic outfit persistence.

# Proposed Architecture
Add an optional anchor constraint to the existing engine. Preserve its scoring and default behavior. Server-only item intelligence reads the authenticated owned wardrobe and user-scoped Fashion DNA, then supplies presentation data.

# Data Flow
Authenticated confirmed owned wardrobe + user-scoped DNA → anchored engine ranking → top three looks → unique co-occurring matches → client sections. Styling navigates to the first idea on the same page.

# API Contracts
Optional internal engine option only. Existing persistence actions unchanged.

# Database Changes
None.

# Failure Modes
Missing owned anchor returns not-found. Insufficient required roles show the requested empty copy. Missing DNA uses neutral deterministic ranking; actual read failures remain errors.

# Security
Every database read is authenticated and user-scoped. All ideas use the confirmed owned pool; curated data and other users' pieces cannot enter results. Private signed previews preserved. No technical identifiers or scores in visible UI.

# Observability
No new logging or metrics.

# Implementation Gates
Anchors supported for all five roles, ranked look/match presentation, accessible native detail sheet, ownership and regression tests, full test/lint/type checks.

# Tests
Anchored ranking against exhaustive small-pool results, low-ranked anchors, optional roles, missing anchors/roles; scoped reads, unknown/foreign anchors, curated exclusion inherited from wardrobe read; consumer markup and sheet fields.

# Rollback
Revert UX-3 files; callers without the optional anchor retain existing behavior.

# Validation Metric
Use of styling ideas and item-page engagement; no instrumentation added.

# Completed Validation
- Added optional anchoring to the existing engine without changing scoring or default callers. Required and optional role anchors are constrained before candidate bounding.
- Server-only intelligence authenticates, resolves the selected piece exclusively from the confirmed owned wardrobe, and scopes the DNA read to the authenticated user. All look/match images reuse signed previews.
- Implemented hero metadata and safe style labels, top three anchored looks, unique co-occurring matches, functioning same-page Style this piece navigation, requested empty state and native consumer details sheet.
- Retained existing edit, photo replacement and removal actions. No outfit is auto-saved, and no LLM/embedding, database or calibration changes were made.
- Added 20 tests including exhaustive small-pool ranking comparisons and ownership/scoped-read/presentation checks; updated existing detail-route tests.
- Full suite: 274 passed, 4 skipped using one worker to reduce existing timing-benchmark contention.
- Repository lint: zero errors, two pre-existing warnings in doc/doc-filelist.js and doc/doc-script.js. Changed files are clean.
- TypeScript and git diff --check passed.
- Browser visual and interaction testing was not performed.
