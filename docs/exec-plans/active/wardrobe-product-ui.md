# Problem

The product has a polished calibration canvas but the surrounding wardrobe journey still has shell viewport gaps, duplicated image handling, sparse item details, and no dedicated review step after single-piece upload.

# User Value

Users can browse their clothes as a visual wardrobe, understand an item’s known metadata, correct AI suggestions before confirmation, and move through uploads without losing context or seeing technical fields.

# Current Repository State

The app uses Next 16, Tailwind CSS 4, a fixed bottom navigation, Supabase server actions, private media assets, and draft/confirmed wardrobe states. Full-outfit review already polls extraction and supports explicit Skip/Add decisions. Single-piece upload creates a draft and queues extraction but currently routes directly to `/wardrobe`.

# Product Scope

Frontend shell, shared garment presentation, wardrobe browsing/detail/edit, and single-piece review routing. Existing ownership, draft confirmation, extraction, RPC, recommendation, and AI semantics remain unchanged.

# Proposed Architecture

- App layout owns light background, dynamic viewport sizing, and bottom-nav content clearance.
- `GarmentImage` owns loading, success, error fallback, private/public URL policy, and object sizing.
- `FlatLay`, `WardrobeScreen`, detail, and review compose `GarmentImage` rather than duplicating image behavior.
- Shared structured metadata controls are used by item edit/review surfaces.
- Single-piece review uses the existing draft item and existing confirmation/update actions.

# Data Flow

Single upload → existing private media + extraction queue → draft item → review route → user edits → existing confirm/reject action → confirmed wardrobe.

# API Contracts

Additive server action to read one authenticated draft by ID; existing update and confirmation actions are reused. No database or RPC contract changes.

# Database Changes

None.

# Failure Modes

Image loading/failure uses stable placeholders. Missing extraction data remains editable and is never invented. Confirmation errors keep the review screen and allow retry. Shell spacing prevents fixed navigation from obscuring controls.

# Security

Draft lookup is authenticated and user-scoped through the existing server action. No browser-supplied ownership is trusted. Existing private signed URLs and media policy are preserved.

# Implementation Gates

1. App shell and shared image component.
2. Wardrobe visual cards and detail/editor polish.
3. Single-piece review route.
4. Reuse image component in full-outfit review and focused tests.

# Tests

Add shell/image/card/detail/single-review assertions while preserving existing wardrobe and review semantic tests. Run focused Vitest, full Vitest, ESLint, and `npx tsc --noEmit`.

# Rollback

Revert the shell, shared image, wardrobe presentation, review route, and additive action changes. No durable state rollback is needed.

# Validation Metric

Upload-to-confirm completion, draft correction rate, image fallback rate, wardrobe card interaction, and reduced navigation-overlap reports at 375/430/768/1024/1280/1440 px.
