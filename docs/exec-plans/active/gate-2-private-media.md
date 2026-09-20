# Gate 2 — Private Media and Safe Upload

## Current state

Legacy uploads use the public `wardrobe-images` bucket and permanent URLs. The private bucket and `media_assets` schema from `20260916160000` were manually applied before being recorded in the migration ledger. A read-only object audit found every expected table, column, constraint, index, policy, and bucket setting present, with zero media rows, linked items, or private objects. The ledger was then repaired to record the already-present migration.

New wardrobe and wishlist uploads validate decoded JPEG, PNG, or WebP bytes, enforce a 10 MB maximum, generate server-side paths, and store stable private references. Reads resolve owner-authorized media asset IDs to short-lived signed URLs. Database failures remove newly uploaded objects and metadata. Existing HTTPS URLs remain unchanged.

`20260918085635_gate2_media_privilege_hardening.sql` is a pending forward-only migration. It removes default broad grants, caches `auth.uid()` in RLS expressions, and adds the ownership-checking media attachment RPC. Its final SQL was executed only inside a rollback transaction for schema validation.

## Validation

- Migration ledger aligned through `20260916160000`.
- Focused Vitest: 3 files, 21 tests passed.
- TypeScript: passed with `npx tsc --noEmit`.
- Final hardening SQL: passed against the linked schema and rolled back.
- Disposable database RLS/storage integration tests remain required before Gate 2 approval.
