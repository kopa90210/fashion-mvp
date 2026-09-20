# Gate 1 — Migration Ledger Blocker

## Decision

**PAUSED before implementation.** The Gate 1 prompt requires work to stop when
the remote or local migration ledger cannot prove which duplicate `0014`
migration was applied. That proof is not available in this workspace.

No historical migration, schema, RLS policy, RPC, application query, or test
was changed during this Gate 1 attempt.

## Exact Evidence

- The repository contains two different migrations with the same version:
  - `0014_wishlist_items.sql`, added by commit
    `d2b4d967eca9fa8d5cf02122153f64b8888f4c8a` on 2026-08-26.
  - `0014_phase4b_source_photo_pipeline.sql`, added by commit
    `30696a8c7479e989c367f1dc4e2fc0e0b49446e2` on 2026-08-29 and modified by
    commit `26f363933aea6c0a00571068ee947ff55f5b5fef` later that day.
- The files differ in content and purpose. The wishlist migration creates
  `public.wishlist_items`; the source-photo migration creates
  `public.source_photos` and extends wardrobe/extraction tables.
- Supabase CLI is not installed locally.
- `supabase/config.toml` is absent, so this checkout is not configured as a
  disposable local Supabase project.
- No environment variable name indicating a Supabase/PostgreSQL database
  connection is present in the current process.
- No local migration ledger or exported remote ledger exists in the repository.
- Project reports state that the source-photo migration ran, but repository
  reports are not database evidence under `AGENTS.md`.
- On 2026-09-16, the linked remote project `svbkadgcpbpnbfzaqvsf` returned an
  empty remote migration ledger: `supabase migration list --linked` showed a
  blank Remote value for every local version, including both `0014` files.
- `supabase db push` therefore attempted `0001_initial_schema.sql` and stopped
  at its first statement with `relation "users" already exists` (SQLSTATE
  `42P07`). No migration may be assumed applied from that failed command.
- A schema-only remote dump was attempted with `supabase db dump --linked
  --schema public`; the CLI requires Docker or Podman for that operation and
  neither is available on this workstation.
- A read-only `supabase inspect db table-stats --linked` check confirmed that
  the remote already contains both `public.source_photos` and
  `public.wishlist_items`, so both logical duplicate-`0014` schema effects are
  present. It also revealed tables outside the current migration set, including
  backup, extraction-job, try-on, and feedback-event tables.

## Why Git History Is Insufficient

Git proves when each SQL file entered source control. It does not prove which
file a deployment runner associated with version `0014`, whether one file was
run manually, or whether both schema effects exist in the target database.
Choosing from Git history could make later migration repair diverge from the
real database.

## Least-Risk Repair

1. Obtain a read-only export from every supported database environment of:
   - the `supabase_migrations.schema_migrations` row or rows for version
     `0014`;
   - the ledger table's column definition, so names/checksums/statements are
     interpreted correctly;
   - schema fingerprints for `public.wishlist_items`, `public.source_photos`,
     and the Phase 4B columns on `public.wardrobe_items` and
     `public.extraction_log`.
2. Save sanitized evidence under `docs/migration-ledger/`; never store database
   credentials or user data.
3. Classify each environment as wishlist-only, source-photo-only, both, or
   neither. Treat schema presence as corroborating evidence, not a substitute
   for the ledger.
4. After the applied history is proven, resolve the duplicate version without
   rewriting already-deployed SQL content. Preserve the applied file/version
   mapping and assign a new timestamped version only to the unapplied logical
   change.
5. Add `supabase/config.toml` and a disposable database workflow. Validate a
   fresh replay and one representative upgrade path before creating
   `20260916000100_canonical_ownership.sql`.
6. Resume the ownership inventory, backfill, RLS/RPC hardening, application
   changes, and cross-user tests only after the migration order is deterministic.

Do not use `supabase migration repair --status applied` to mark every current
file yet. That command changes remote migration history, and the discovered
unversioned schema drift means a blanket baseline would make the ledger claim
more certainty than the evidence supports.

## Evidence Needed to Resume Gate 1

A sanitized ledger/schema export from the actual Supabase environment is
required. It must identify what version `0014` represents or demonstrate the
exact schema state well enough to create an explicit reconciliation migration.

The remote ledger is now known to be empty, so the remaining evidence must be
a schema fingerprint from the remote project. Docker Desktop or Podman enables
the CLI schema dump; alternatively, run the sanitized SQL Editor query in
`docs/migration-ledger/remote_schema_evidence.sql` and save its results without
user data.
