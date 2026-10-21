# Outfit-photo extraction (local draft)

## Problem
The current upload creates one draft from one image. The supplied Colab notebook can detect and segment several garments from an outfit, optionally reconstruct them, and generate metadata, but its API returns only a JSON-encoded metadata string. It has no authentication, stable garment identifiers, image artifacts, or bounded job lifecycle.

## User value and product scope
One outfit photo should produce separate, editable garment drafts. The user sees the original crop first, may compare an optional reconstruction, and explicitly adds or discards each piece. This advances the MVP wardrobe and correction loop; it does not add commerce or virtual try-on.

## Current state and architecture
StyleGraph already has private Supabase media, `source_photos`, draft `wardrobe_items`, and a local Gate 5 AI job worker. Gate 2–5 migrations remain local/unapplied, so this work is a further local draft only. Next.js authenticates, validates, and stores the source image; a durable job is queued. A trusted Python worker fetches that private image and calls a versioned inference endpoint running the notebook model functions in Colab for testing. Only the worker holds the Supabase service key and the endpoint token. The browser never calls ngrok or the models.

## Data flow and contracts
Upload -> private source asset + `source_photos` row -> idempotent `outfit_photo` job -> remote `/v1/outfit-extract` -> validated per-garment metadata and PNG artifacts -> private generated assets -> transactional completion creating separate draft wardrobe items linked to the source photo and AI run -> review screen -> explicit add/discard.

The provider response is untrusted. Limit image bytes, dimensions, garment count, metadata lengths, categories, normalized boxes, and artifact sizes. Reconstruction is optional. If it fails, the segmented crop remains reviewable. Save no prompts or raw model response in Postgres. No secrets go to the browser or notebook output.

## Database and failure modes
A forward migration extends source-photo media linkage, the job type/target, and per-item original/reconstructed media references. The completion RPC verifies the current lease and source ownership, then creates the run and drafts in one short transaction. Provider calls and Storage uploads happen outside the transaction. Retries use the existing Gate 5 lease/backoff mechanism. An ambiguous completion may leave an unreferenced generated object; reconciliation must inspect DB references before cleanup. Do not delete another user's objects.

## Security and observability
Source image remains private and only owned authenticated users can read review state. The remote endpoint requires a server-to-server token, has no Supabase credentials, and returns only bounded structured results. Job/run IDs and safe error codes provide correlation. Do not use a transient Colab/Kaggle runtime as an availability promise for real users.

## Implementation gates and tests
1. Extract a notebook-compatible FastAPI bridge with a versioned contract and CPU-only mocked tests.
2. Add local migrations, worker adapter, upload action, and review UI with mock tests.
3. On a disposable DB, test two-user RLS, ownership, claim/retry, malformed provider output, duplicate completion, and artifact provenance.
4. In Colab, run a small consented image set; measure detections, segmentation quality, reconstruction fidelity, metadata validity, correction rate, latency, and GPU cost. Confirm the notebook's models and licenses are appropriate for the eventual hosted deployment.

## Rollout, rollback, validation
Keep the existing single-item upload path while the new outfit-photo path is behind a flag. No migration is applied or pushed from this draft. If inference is unavailable, preserve the source image and show a retry state; never silently confirm AI drafts. A production rollback disables new enqueueing and leaves durable jobs and private images for recovery. Success is measured by upload completion, per-garment acceptance/correction, and time to a usable wardrobe.

## Current verification and release blockers
TypeScript, lint, Vitest, and Python mock tests pass locally; the new SQL parses statically. The migration has **not** run on a disposable database, so its RLS, triggers, and transactional behavior are unverified. The notebook has **not** run on a GPU through this bridge. Read-only inspection of the configured database found Gate 2–4 objects without matching migration-ledger rows and no Gate 5 job tables; see `docs/migration-ledger/outfit-pipeline-readiness.md`. Keep the feature flag disabled until a disposable Supabase project passes two-user ownership, direct-update bypass, lease/retry, and duplicate-completion tests. Then validate a consented end-to-end upload using the actual Colab model functions. A persistent GPU service is needed before promising production availability.

The local contract test now feeds the authenticated notebook bridge response through the worker validator and private-artifact adapter without a GPU. Recommendation reads exclude unconfirmed/retired membership rows and sign private media for confirmed items. Upload validation rejects images above the bridge's 20-megapixel limit before queuing. The Next.js production build passed; the complete Vitest suite passed with bounded concurrency (204 passed, 4 skipped); the Python suite passed (85 tests). No RLS/storage integration result is claimed.

## Repository cleanup candidates
- `.github/workflows/daily-outfit-generation.yml` still invokes `generate_daily_outfit.py --all-users`, while that legacy script is now dry-run-only. Replace the schedule with the Gate 5 queue/worker deployment after its migration is validated; do not ship the stale workflow as a working scheduler.
- `src/app/actions/notes` is scratch command text under the application tree with no runtime import. Move it to an operational note or remove it after checking whether the maintainer needs those commands.
- `remote_schema.sql` is an untracked, zero-byte scratch file with no code references; it can be removed after the maintainer confirms it has no personal value.
- `extract_and_upload.py` and `run_extract_and_upload.ps1` are offline data-import tooling, not part of the user upload flow. Keep them until existing curated-data/backfill use is confirmed, then archive if superseded.
- The notebook should remain an external experiment until model licensing, dependency pinning, and GPU evaluation are done. Do not copy its cell outputs, model weights, or temporary ngrok URLs into the app repository.
