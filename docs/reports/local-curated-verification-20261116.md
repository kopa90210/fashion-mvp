# Local curated verification — 2026-11-16

**Final verdict: PASS.** Executed from PowerShell in `F:\project\autofashion`.
Dataset: `stylegraph_qwen_curated_processed (3)`. Database/API target:
`http://127.0.0.1:54321`; app: `http://127.0.0.1:3000`.

No hosted Supabase connections, Git pushes, deployments, database resets,
Qwen runs or dataset image reprocessing were performed. Existing checkout edits
and dataset deletions were inspected and preserved. Credentials were not printed.

## Review and file-only gate

Reviewed AGENTS.md, the cache/hash validator, bootstrap importer, collection
migration/backfill generator, quiz choice propagation, ranked/search filters,
and GarmentImage policy before changing them. The current dataset has `manifests`,
`processed`, and `reports` directories, with feminine and legacy musculine source
folders. Existing deterministic UUID generation was retained. Added muscline and
femine aliases; musculine was already supported. Unknown/conflicting labels remain
errors; only explicit shared/unisex evidence opts into both collections.

Every manifest path and processed_relative_path was checked against its source;
PNG hashes, dimensions, format, alpha-channel contract and deterministic identity
digest format were validated. Duplicate IDs/source paths, missing files, ambiguous
labels, escaped paths and orphan PNGs block import. Both collections are required.

Dry run: **25 valid; zero rejections**. Complete rejection list: `[]`.

| Collection | Tops | Bottoms | Outerwear | Footwear | Total |
|---|---:|---:|---:|---:|---:|
| Feminine | 1 | 3 | 1 | 0 | 5 |
| Masculine | 3 | 6 | 4 | 7 | 20 |

Raw original photos were not supplied in this processed cache. Their stored
photo_sha256 identity format was checked; original-photo hashes could not be
independently recomputed. Processed PNG content hashes were checked directly.

## Local database/import evidence

The local migration ledger and actual schema agreed: collection migration
`20261115161405` was already applied. No migration or ledger repair was needed
in this verification run. Existing public wardrobe-images bucket was verified.

Baseline: **13 curated rows, 69 ownership links**. Full local before/after row and
ownership snapshots are ignored private artifacts. Preflight completed all item
checks before any upload: **25 inserts, zero existing rows needing labels, zero
skips**. Import wrote 25 PNGs and 25 wardrobe rows. Existing-row label updates
are guarded PATCHes containing only catalog_collection; this path was covered
by a focused test but was not needed for the live batch.

The apply command's second execution made zero writes. A separate importer run
then reported **25 skips, zero inserts, zero labels, zero HTTP writes**.

All 25 imported IDs have their expected labels, and all served PNG bytes match
the validated local PNG hashes. Existing IDs/image paths/other fields were
unchanged. SQL confirmed **38 rows and 38 distinct curated IDs**. Full ownership
snapshots matched exactly, including after browser tests and disposable-user cleanup:
**69 links before and after**.

Final database counts (including preexisting fixtures and unlabeled catalog rows):

| Collection | Tops | Bottoms | Outerwear | Footwear | One-piece | Accessories | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| Feminine | 2 | 3 | 1 | 0 | 0 | 0 | 6 |
| Masculine | 4 | 6 | 4 | 7 | 0 | 0 | 21 |
| Shared | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| Unlabeled | 2 | 1 | 0 | 2 | 2 | 3 | 10 |
| Total | 9 | 10 | 5 | 9 | 2 | 3 | 38 |

Unlabeled preexisting rows remain excluded from both scoped catalogs. No labels
were invented for them, and no preexisting images were overwritten.

## Real Playwright CLI proof

Installed and inspected `@playwright/cli` **0.1.24** help, including open,
run-code --filename, state-load, screenshot and requests. Used its headless Chrome
session with a disposable local account authenticated through the real cookie
client. Completed all five quiz questions after choosing each looks collection.
A browser network guard allowed loopback destinations only.

Verified batch comparison, both in category bottom:

- Masculine: Cotton Trousers, `5e0f22cf-40ca-54d4-b89f-e2af4a3bccff`.
- Feminine: Classic Black Wide-Leg Pants, `477877cc-e5e1-50bf-a485-c68d2bd6f472`.

| Assertion actually executed | Men | Women |
|---|---|---|
| Complete five-question quiz; selected collection in resulting URL | PASS | PASS |
| Search own batch item by exact name; card appears | PASS | PASS |
| Search opposite batch item by name; explicit empty result and no opposite card | PASS | PASS |
| Imported test PNG loads with nonzero naturalWidth | PASS | PASS |
| Refresh retains collection URL and scoped results | PASS | PASS |
| Show more retains scope and adds cards | PASS, clicked | Not offered; not executed |
| Every displayed card after refresh/pagination has correct/shared audited label | PASS | PASS |
| Explicit Local test - Shared fixture appears in tops | PASS | PASS |
| No broken rendered images | PASS | PASS |
| No failed catalog requests, blocked external requests or HTTP 500s in clean runs | PASS | PASS |

**19 programmatic browser assertions passed.** Full CLI outputs, request summary
and parsed result JSON are under `.tmp/local-curated-verification/run-20261116/`.

Screenshots, captured through the CLI's run-code page.screenshot and visually inspected:

- `.tmp/local-curated-verification/run-20261116/masculine.png`
- `.tmp/local-curated-verification/run-20261116/feminine.png`

## Problems found and resolved

The initial browser run exposed a real Next.js optimizer **504 upstream timeout**
fetching the local imported PNG. The source PNG and storage GET were valid.
Added a bypass only in development, for HTTP loopback port 54321 and the public
wardrobe-images path. Production and hosted-public image optimization remain
unchanged and have regression coverage. The final clean browser runs loaded both
test PNGs and passed the network checks.

An intermediate TypeScript check found trailing corruption in generated
`.next/dev/types/routes.d.ts`. Saved the generated file, restarted only the dev
server started in this session, and let Next regenerate it; TypeScript then passed.
Ignored generated CLI/private verification artifacts to prevent accidental tracking
and reduce development watcher churn. Initial cold-compilation/CLI navigation
timeouts and the pre-fix image failure are not presented as successful tests.

## Validation executed

- Pytest local import + collection backfill tests: **24 passed**.
- Vitest wardrobe + quiz actions + piece-selection tests: **45 passed**.
- Vitest image-policy tests: **4 passed**.
- TypeScript `tsc --noEmit`: **PASS** after generated-file regeneration.
- ESLint image-policy source/tests: **PASS**.
- Full repository suites and production builds were not run; this was local
  catalog/import/browser verification, not a production release.

The disposable account was removed through the loopback Auth admin API after
verification. Private auth input/session files were deleted. Browser was closed.
No remaining blocker to this local verification. The shared fixture is preexisting
synthetic metadata with a deliberate image placeholder; it is not an imported PNG.

## Files changed in this run

- `.gitignore`: ignore local verification and Playwright generated artifacts.
- `scripts/bootstrap_curated_catalog.py`: add legacy muscline/femine aliases.
- `scripts/local_curated_import.py`: strict loopback file/preflight/import verifier.
- `tests/test_local_curated_import.py`: validation, alias, loopback and label-only tests.
- `src/lib/media/image-policy.ts`: dev-only local public-image optimizer bypass.
- `src/lib/media/image-policy.test.ts`: bypass scope/production regression coverage.
- `docs/curated-ingestion.md`: local verification command workflow.
- `docs/exec-plans/completed/local-curated-import-verification.md`: execution record.
- `docs/reports/local-curated-verification-20261116.md`: this report.

Temporary scripts, snapshots, audit JSON, screenshots and sanitized CLI evidence
were also created in the ignored local evidence directory. Original user changes
in the shared files were preserved; nothing was committed or pushed.
