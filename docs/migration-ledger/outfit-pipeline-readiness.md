# Outfit-photo pipeline database readiness — 2026-09-19

Read-only inspection of the database configured by `.env.local` was performed with a PostgreSQL transaction in read-only mode. No migration was applied, repaired, or marked applied.

## Observed ledger

- `20260916150000` (`gate1_canonical_ownership`): recorded, 35 statements.
- `20260916160000` (`gate2_private_media_assets`): recorded, 15 statements.
- `20260918085635` (Gate 2 privilege hardening), `20260918103000` (Gate 3), `20260919100000` (Gate 4), `20260919120000` (Gate 5), and both outfit-photo migrations: **no ledger rows**.
- Legacy `20260916144733` is recorded as `update_wardrobe_schema` with zero statements; this inspection did not change it.

## Observed schema

- `media_assets`, `outfit_items`, `outfit_backfill_anomalies`, `preference_events`, and `fashion_dna_versions` tables exist.
- `users.timezone` and `outfits.scheduled_for` columns exist.
- `attach_media_asset_to_wardrobe_item`, `is_valid_iana_timezone`, `create_outfit_with_items`, and `submit_outfit_feedback` functions exist. The Gate 3/4 `outfits_one_generated_daily_per_user_date_idx` and `preference_events_user_occurred_idx` indexes exist.
- `ai_jobs`, `ai_runs`, `source_photos.media_asset_id`, `outfits.ai_job_id`, `claim_ai_jobs`, `complete_ai_job`, `enqueue_outfit_photo_job`, and `complete_outfit_photo_job` are absent.
- `seed_fashion_dna_baseline` and `submit_style_quiz` are absent, so the observed Gate 4 schema cannot be assumed complete.

The schema therefore contains some objects from migrations whose ledger versions are absent. A straight `supabase db push` would try to replay those migrations and could conflict with existing objects or data. Presence of one object is not proof that the full migration ran.

## Required reconciliation before deployment

1. Start a disposable local Supabase database and replay all local migrations in order. Run the two-user RLS, job lease, duplicate completion, direct-update bypass, and private-media tests there. Docker's Linux engine was unavailable during this check because this Windows host reports that WSL is not installed. A separate disposable Supabase project is an alternative.
2. Compare **every** Gate 2 hardening, Gate 3, and Gate 4 table, column, index, constraint, policy, trigger, function definition, and data backfill against the configured remote schema. Determine which statements were applied manually and whether their effects match the local migration files.
3. Write a forward-only reconciliation migration for any real differences and validate it on a disposable copy. Decide ledger repair only from verified evidence; do not infer completion from filenames or isolated objects.
4. Apply and verify Gate 5, then the outfit-photo enum migration and pipeline migration. Keep `ENABLE_OUTFIT_PHOTO_UPLOAD=false` until a real authenticated upload and worker run pass on the target environment.

The outfit model endpoint has not been supplied or run in Colab/Kaggle, so GPU inference and model quality remain unverified independently of database readiness.
