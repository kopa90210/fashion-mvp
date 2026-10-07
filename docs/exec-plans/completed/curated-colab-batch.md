# Curated Colab batch processor

## Problem

Curated catalog image cleanup and metadata inference are expensive, while
catalog validation, cache ownership, duplicate checks, and durable writes must
remain local.

## Design

`StyleGraph_Curated_Batch_Processor.ipynb` runs the existing `curated_pipeline`
contract in two phases: Colab produces transparent PNGs and manifests, then
the existing local upload command validates and writes accepted cache entries.
The notebook uses rembg `isnet-general-use` and the official Google GenAI SDK.

## Safety and resume

The notebook receives only image bytes and folder hints. It has no application
database or storage credentials. Source hashes and validated manifests make
reruns resumable; `FORCE_REPROCESS` explicitly bypasses the cache. A failed
image is recorded with a safe error code and does not stop the batch.

## Validation

The batch processor writes `reports/results.json`, `reports/failed.json`, and
exports only `processed/`, `manifests/`, and `reports/` in the download ZIP.
