# Curated catalog ingestion

## Strict local batch verification

Use `scripts/local_curated_import.py` for a processed cache containing both
onboarding collections. It reads only `.env.development.local`, requires matching
loopback app/import URLs, rejects invalid or duplicate source identities, and
does not call inference providers. Run the modes in order with a report folder:

```powershell
python scripts/local_curated_import.py --mode dry-run --dataset-root "stylegraph_qwen_curated_processed (3)" --report-dir .tmp/local-curated-verification/new-run
python scripts/local_curated_import.py --mode preflight --dataset-root "stylegraph_qwen_curated_processed (3)" --report-dir .tmp/local-curated-verification/new-run
python scripts/local_curated_import.py --mode apply --dataset-root "stylegraph_qwen_curated_processed (3)" --report-dir .tmp/local-curated-verification/new-run
```

Preflight completes before any write. Matching existing curated rows may receive
only a missing collection label; IDs, images and ownership stay unchanged.
The apply command verifies image hashes, ownership preservation and a zero-write
second execution. Use a separate report directory when rerunning the command so
the first import's snapshots remain available. Reports and browser auth artifacts
are local ignored files; never publish them.

## Hosted importer authentication and preflight

`scripts/hosted_curated_import.py` reads only the process environment, never `.env`
files. Set `STYLEGRAPH_HOSTED_SUPABASE_URL` to the exact hosted project URL and
`STYLEGRAPH_HOSTED_SUPABASE_SERVICE_KEY` to its secret key in the launching
PowerShell session. New `sb_secret_` keys are sent in `apikey` only; legacy
service-role JWTs retain Bearer authentication. Publishable keys are rejected.

Run a read-only hosted check from that session:

```powershell
python scripts/hosted_curated_import.py --preflight --target-project-ref wwmumdmpruqwralxniwk
```

Preflight validates the dataset, project URL, public bucket, existing rows, and
storage duplicates. Storage listing uses a read-only POST endpoint. It never
uploads, inserts, or creates a rollback manifest. Default dry-run remains local
and makes no requests. `--apply` retains its separate project/phrase confirmations
and rollback-manifest requirement. HTTP failures report a fixed operation label
and status, without credentials, headers, or upstream response bodies.

Repeated content-derived item IDs within a dataset are skipped automatically.
The importer keeps the first source path in alphabetical order per ID and reports
the copies in `dataset_duplicates` in the plan and rollback manifest. Category
counts and intended writes use unique candidates. Matching confirmed curated
items already in Supabase are skipped too. Conflicting rows and orphan storage
objects still stop the import for reconciliation; no existing data is overwritten.

To diagnose a bucket HTTP error with the same PowerShell credentials:

```powershell
python scripts/hosted_curated_import.py --check-connection --target-project-ref wwmumdmpruqwralxniwk
```

This compares a direct bucket GET with the SDK bucket GET, prints statuses only,
and does not read the dataset or create any manifest. Both calls are read-only.
If the direct call succeeds and the SDK call fails, investigate client differences;
if both fail, investigate the configured project/credential and project access.

Curated catalog ingestion has two independent phases. The laptop owns source files, hashing, validation, cache artifacts, duplicate checks, and all local Supabase writes. The remote Colab service receives one image and two non-sensitive hints. It performs background removal and fashion metadata inference only.

## Dataset layout

```text
datasets/
  raw/
    feminine/tops/
    feminine/bottoms/
    feminine/one_piece/
    feminine/outerwear/
    feminine/footwear/
    feminine/accessories/
    masculine/...
    neutral/...
  processed/       # transparent PNGs, preserving raw subdirectories
  manifests/       # validated JSON manifests, preserving raw subdirectories
```

Dataset images and generated artifacts are ignored by Git. Only the directory scaffold is committed.

## Commands

Process raw images through the remote service without contacting Supabase:

```powershell
python extract_and_upload.py --dataset-root datasets process
```

Valid cache entries with the same raw-image SHA256 are skipped. Use `--force` to rerun inference. Configure the request with `CURATED_PIPELINE_URL`, `CURATED_PIPELINE_TOKEN`, and optional `CURATED_PIPELINE_TIMEOUT_SECONDS`.

Upload the cached results to the local Supabase instance without contacting Colab:

```powershell
python extract_and_upload.py --dataset-root datasets upload
```

Upload mode rejects Supabase URLs whose host is not local. Existing `--force-duplicates` and `--allow-duplicates` behavior remains available on the `upload` command.

Both commands continue after an individual image fails and report `processed`, `accepted`, `rejected`, and `skipped` counts.

## Remote request

The client sends `POST {CURATED_PIPELINE_URL}/v1/curated/process` with:

- `Authorization: Bearer <CURATED_PIPELINE_TOKEN>`
- multipart file field `image`
- form fields `presentation_profile` and `expected_category`

Folder names derive the hints. For example, `feminine/one_piece/dress.jpg` produces `presentation_profile=feminine` and `expected_category=one_piece`.

The response must be a JSON object with `schema_version: "curated-v1"`, an `attributes` object containing the complete curated fashion schema, and:

```json
{
  "cutout": {
    "mime_type": "image/png",
    "width": 1200,
    "height": 1600,
    "png_base64": "..."
  }
}
```

The client validates the schema, normalized category and layer role, confidence, strict base64, PNG format, declared dimensions, size limit, and transparency support. Manifests store the PNG hash and relative path; they never store the base64 payload.

Colab receives no Supabase URL, service key, database credentials, or write access. Tokens, response bodies, image bytes, and base64 data are not logged.
# Colab batch mode

`notebooks/StyleGraph_Curated_Batch_Processor.ipynb` is the remote image
processing entry point. It preserves the same `curated-v1` response and cache
manifest contract as the laptop pipeline, deriving profile and category hints
from `raw/{feminine,masculine,neutral}/...` folders (including `one_piece`).

The notebook writes only local `processed/`, `manifests/`, and `reports/`
artifacts. Download `stylegraph_curated_processed.zip`, inspect the reports,
and use the existing local `upload` command to perform local validation,
duplicate checks, storage uploads, and database writes. No application
credentials are needed by the notebook.
