# Gemini Track A MVP milestone

Recorded on 2026-10-04.

- Milestone tag: `mvp-gemini-track-a-v1` (annotated).
- Runtime commit: `e4c031c1f890d2621c5a76ab7b0fece6d5365d4e`.
- Provider: `google-gemini`.
- Model: `gemini-3.8-flash`.
- Prompt version: `gemini-outfit-v1`.
- Schema version: `outfit-v1`.

## Architecture

```text
Browser upload
-> Supabase private source photo
-> ai_jobs
-> Python worker
-> GeminiOutfitProvider
-> Gemini structured output
-> mask decoder
-> transparent PNG
-> Supabase private Storage
-> complete_outfit_photo_job
-> review drafts
```

## Scope and validation

Track A uses the segmented source garment only. Reconstructed/prettified images
are intentionally not implemented; the prettifier is deferred. The fallback
notebook pipeline remains available.

The real browser upload, queue, worker, Gemini extraction, segmented PNG upload,
and database completion flow has succeeded, as reported during live validation.
At this checkpoint, `python -m pytest ai_service/tests -q` using the repository's
existing `.venv` passed: **81 tests**, with two dependency deprecation warnings.

This release preserves the working source without changing provider behavior,
retry behavior, or migrations. Generated temporary images, test-upload images,
environment files, and secrets are excluded from the checkpoint commits.

## Known issues

- Gemini can return temporary 503/high-demand responses.
- Review-page latency needs optimization.
- Frontend date hydration mismatch should be fixed separately.

The tag identifies the runtime checkpoint; this document is committed separately
after the tag.
