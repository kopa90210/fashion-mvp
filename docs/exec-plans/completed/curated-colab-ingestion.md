# Status
Completed on 2026-10-05. Validation: `python -m pytest -q` passed 128 tests with two dependency deprecation warnings.

# Problem
Curated catalog ingestion currently performs inference and Supabase writes in one local process, coupling expensive image work to database state and requiring re-inference after local resets.

# User Value
Process curated assets once on remote compute, retain a local validated cache, and replay catalog uploads into disposable local Supabase environments without paying inference cost again.

# Current Repository State
`extract_and_upload.py` scans one directory level, calls Groq directly, validates attributes, performs hash/name duplicate checks, uploads the original image and inserts `wardrobe_items` plus `extraction_log` in one pass.

# Product Scope
Local recursive orchestration, Colab HTTP provider, strict response validation, processed PNG/manifest cache, resumable processing and local-only upload. No user outfit-photo pipeline changes and no database schema changes.

# Proposed Architecture
Split the pipeline into a provider-neutral local cache layer and two CLI modes. Processing owns raw hashes, folder hints and atomic cache writes but has no Supabase client. Upload owns cache validation, duplicate rules and local Supabase writes but never constructs a remote provider.

# Data Flow
`datasets/raw/**` → authenticated Colab request → validated transparent PNG + JSON manifest under matching subdirectories → later local validation/duplicate checks → local Storage → curated row → extraction log.

# API Contracts
`POST /v1/curated/process` receives one multipart image plus `presentation_profile` and `expected_category`. Response schema `curated-v1` contains the complete attribute object and a PNG cutout with declared dimensions and strict base64.

# Database Changes
None. Existing `wardrobe_items` and `extraction_log` contracts remain in use.

# Failure Modes
Timeout, authorization, HTTP, malformed JSON/schema/base64/PNG/dimensions, low confidence, corrupt cache, duplicate hash/name and local upload errors reject one asset without stopping the batch. Atomic cache writes prevent a manifest from describing partial output.

# Security
Processing loads only curated endpoint credentials. Upload loads only Supabase credentials and refuses non-loopback Supabase URLs. Tokens, response bodies, image bytes and Supabase secrets are never logged or sent across boundaries.

# Observability
Per-file safe status and a four-counter summary: processed, accepted, rejected and skipped. Manifests retain source hash, hints, contract version and cutout hash/dimensions.

# Implementation Gates
Provider/contract/cache modules, two-mode CLI, directory scaffold/docs/env variables, fake-provider tests, cached local upload test and complete Python regression suite.

# Tests
Successful response, schema/base64/PNG failures, timeout/401/500, resume, force, recursive folder hints including feminine one_piece, cached local upload, duplicate preservation and no network/Supabase use in processing.

# Rollback
Restore the prior script entry point. Cached assets remain ordinary local files and database schema is unchanged.

# Validation Metric
The same valid cache uploads repeatedly after local resets while unchanged raw hashes cause zero remote inference calls.
