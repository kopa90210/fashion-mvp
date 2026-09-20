# Gate 1 — Canonical Wardrobe Ownership

## Problem

`wardrobe_items.owner_id` and `user_wardrobe_items` previously expressed overlapping ownership concepts. Direct membership deletion could orphan a user-uploaded item.

## Evidence

The reconciled migration ledger is aligned through `20260916144733`. Production evidence reports 47 user-upload rows, all with exactly one canonical membership and no owner-id conflict. Curated rows may intentionally have no membership.

## Implementation

Migration `20260916150000_gate1_canonical_ownership.sql` removes legacy owner-id policies, prevents direct user-upload membership mutation, adds an item-first lookup index, and provides authenticated atomic removal. `owner_id` remains deprecated compatibility data pending a separate consumer audit. Security-definer functions use a fixed `pg_catalog` search path.

## Validation

Static and TypeScript checks run locally. Disposable database RLS integration tests remain pending because Docker is unavailable; the linked remote database is not used for mutation testing.
