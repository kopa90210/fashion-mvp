# Gate 2 — Private Media and Safe Upload

## Current state

Legacy uploads use the public `wardrobe-images` bucket and permanent URLs. The private bucket and `media_assets` schema from `20260916160000` were manually applied before being recorded in the migration ledger. A read-only object audit found every expected table, column, constraint, index, policy, and bucket setting present, with zero media rows, linked items, or private objects. The ledger was then repaired to record the already-present migration.

New wardrobe and wishlist uploads validate decoded JPEG, PNG, or WebP bytes, enforce a 10 MB maximum, generate server-side paths, and store stable private references. Reads resolve owner-authorized media asset IDs to short-lived signed URLs. Database failures remove newly uploaded objects and metadata. Existing HTTPS URLs remain unchanged.

On 2026-10-01, private uploads were moved from a separate admin Storage client
to an authenticated user Storage client created inside the server action. The
server verifies the user, reads that same session, checks the session owner,
and explicitly binds its access token to Storage requests. The linked project
did not accept its current secret key for Storage, and the missing credential
caused every upload to fail before reaching the bucket. The new owner-insert and
owner-delete Storage policies restrict writes to the caller's UUID folder and
to the server-generated UUID image path shape. The bucket remains private and
continues to enforce the 10 MB and JPEG/PNG/WebP limits; application code still
decodes and validates image bytes before upload.

`20260918085635_gate2_media_privilege_hardening.sql` is a pending forward-only migration. It removes default broad grants, caches `auth.uid()` in RLS expressions, and adds the ownership-checking media attachment RPC. Its final SQL was executed only inside a rollback transaction for schema validation.

## Validation

- Migration ledger aligned through `20260916160000`.
- Focused Vitest: 3 files, 21 tests passed.
- TypeScript: passed with `npx tsc --noEmit`.
- Final hardening SQL: passed against the linked schema and rolled back.
- Authenticated private-media write policies applied to the linked schema.
- The running development app was found to target local Supabase rather than
  the linked project; the same policies were then applied to the local schema.
- Rolled-back RLS checks: own-folder insert passed; cross-user insert was denied.
- Local Storage API integration: disposable user's own-folder upload passed,
  cross-owner upload was denied, and the object/user cleanup passed.
- Focused Vitest after the upload-client change: 3 files, 29 tests passed.
- TypeScript and targeted ESLint passed.
- Disposable database RLS/storage integration tests remain required before Gate 2 approval.
