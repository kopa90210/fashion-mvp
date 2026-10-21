# Gate 2 exception before Gate 3

## Decision

Gate 3 may be developed locally while Gate 2 remains incomplete. This is an
explicit sequencing exception approved by the founder on 2026-09-18.

## Remaining Gate 2 work

- Apply `20260918085635_gate2_media_privilege_hardening.sql` through the
  normal linked-migration workflow.
- Run RLS and Storage integration tests against a disposable Supabase
  database.
- Complete private-media resolution and cleanup coverage in every remaining
  wardrobe consumer before deployment.

## Boundary

No Gate 3 migration may be applied to the linked production database until
the Gate 2 items above have passed. Gate 3 changes remain local and
uncommitted during this exception.
