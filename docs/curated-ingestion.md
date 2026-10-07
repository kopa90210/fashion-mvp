# Curated catalog ingestion

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
