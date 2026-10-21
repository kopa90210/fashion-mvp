# Gate 4 — Transactional feedback and versioned Fashion DNA

Gate 4 is local-only. Gates 2 and 3 are still unapplied, so its migration must
not be pushed or run against the linked project.

`preference_events` makes a user interaction idempotent. Its one feedback
operation verifies the outfit belongs to the caller, resolves server-owned
outfit items, locks the current DNA projection, writes an analytics-compatible
`feedback` row, writes the next sequential DNA version, and updates the
projection in one transaction. Repeating a key returns the original version
without another update.

The historical `fashion_dna` projection seeds version zero once per user. No
historical preference events are invented.

New accounts receive version zero from an insert trigger. Quiz submissions use
`submit_style_quiz` so later vector resets also create a version. Direct
authenticated writes to `fashion_dna`, `feedback`, events, and versions are
revoked. Existing feedback analytics still read `public.feedback`, which the
feedback RPC writes in the same transaction as the event and version.
The UI uses `outfit-feedback:<outfit-id>` as the interaction key, so a retry
after a page reload resolves the same event.

The event type is currently limited to `outfit_feedback`; expanding it requires
a new product decision and migration. The database also permits only one
feedback event per user and outfit, even if a second idempotency key is sent.

## Validation status

- Focused action and quiz tests pass; TypeScript checking passes.
- Targeted ESLint did not finish and was stopped after producing no diagnostics;
  its result is inconclusive.
- The linked production database was not changed.
- Disposable database migration, RLS, concurrency, retry, rollback, and
  reconstruction tests remain required. Docker Desktop's Linux engine was not
  running when checked on 2026-09-19, so those tests were not executed.
- Gate 2 hardening and Gate 3 schema approval/application remain prerequisites
  before any Gate 4 production migration.
