# Problem
Verify the existing curated image cache can populate local Supabase and preserve onboarding collection isolation.

# Scope and safety
Loopback only. Preserve existing edits, IDs, image paths, ownership and database data. No hosted connections, pushes, deployments, resets, inference, or image reprocessing. Credentials stay out of output.

# Gates
1. Record checkout baseline and validate every manifest path, processed PNG/hash, label and unique source ID. Require both collections and zero rejected files.
2. Audit local schema/ledger. Snapshot curated rows and ownership. Preflight inserts, label-only updates and skips before applying.
3. Import once, verify counts/labels/images/ownership, then rerun and require zero writes.
4. Use the Playwright CLI with a disposable local account to complete both quizzes, assert positive and negative searches, refresh/pagination isolation and capture screenshots.

# Contracts and failure modes
Manifest evidence determines collection; model attributes determine category. Reject ambiguity, duplicate IDs, conflicting hosted labels, invalid PNGs and non-loopback URLs. Stop before import on any validation failure. Existing rows may change only catalog_collection.

# Database changes
Only the existing collection migration if missing and ledger matches; curated inserts and guarded label updates. No ownership changes from import. Browser onboarding uses a disposable test user.

# Validation and rollback
Save local reports and before/after snapshots under .tmp/local-curated-verification. Run importer regressions, collection tests, applicable TypeScript/lint checks and real CLI browser assertions. Recovery uses the audited snapshots; never delete preexisting rows/images. Browser test data is marked disposable.

# Validation metric
Both collections load their correct imported items, reject opposite-collection searches, preserve scope on refresh/pagination, return valid images and have no catalog 500s. A second import writes nothing.

# Outcome
PASS on 2026-11-16. File gate: 25 valid, zero rejected (5 feminine, 20 masculine).
Local preflight/import: 25 inserts, zero label updates/skips. Separate rerun:
25 skips and zero writes. 69 ownership links preserved; 38 unique curated IDs.
Playwright CLI: 19 assertions passed over both real five-question quizzes,
opposite-name searches, shared fixture, refresh and available pagination.
The initial optimizer timeout was corrected with a development-only loopback
image bypass; subsequent clean browser runs had no failed catalog requests,
broken rendered images or 500s. Generated route types were repaired, not source
history or database state. Test account and private authentication files removed.
See docs/reports/local-curated-verification-20261116.md for counts and evidence.
