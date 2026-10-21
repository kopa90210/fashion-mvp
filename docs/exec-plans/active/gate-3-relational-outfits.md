# Gate 3 — Relational outfits and idempotent daily generation

## Problem

`outfits.item_ids` is JSON, so the database cannot enforce item foreign keys,
canonical slots, active wardrobe ownership, or one daily result per user-local
date.

## User value

Users see at most one valid daily outfit for their own local date. Removed or
retired pieces are not rendered as active, and daily retries cannot create
duplicate recommendations.

## Data model

- `users.timezone` stores a verified IANA timezone and defaults to `UTC` for
  existing users.
- `outfits.scheduled_for` is the user-local business date for daily sources.
- `outfit_items` holds the real item foreign keys, slots, order, and optional
  score contribution.
- Existing `item_ids` remains readable during the compatibility period.

## Write boundary

`create_outfit_with_items` is an authenticated, fixed-search-path database
function. It verifies current `user_wardrobe_items` membership, rejects retired
items, derives slots from `wardrobe_items.layer_role`, validates the required
base-layer/bottom/footwear roles, and inserts the parent and child rows in one
transaction. Daily writes are serialized by user/date and also protected by a
partial unique index.

## Legacy migration

The migration records malformed JSON arrays, duplicate IDs, unavailable items,
missing active membership, invalid roles, duplicate slots, and duplicate daily
dates in `outfit_backfill_anomalies`. It backfills only valid rows. Daily rows
without a known historical timezone use the legacy user's default `UTC`, which
is recorded in the migration documentation.

## Gate 2 dependency

This gate is local-only under `gate-2-exception-before-gate-3.md`. Do not apply
the Gate 3 migration while Gate 2 privilege hardening and disposable RLS/Storage
tests remain pending.

## Tests

- Unit tests for the local-date calculation and relational/legacy read path.
- Focused action tests for RPC writes and conflict reuse.
- Disposable database migration, RLS, FK, duplicate-daily, DST, and backfill
  anomaly tests before any production apply.
