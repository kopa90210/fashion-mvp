# Phase 4B — Foundation Gate 0: Architecture Contract Review

**Status:** CONDITIONALLY APPROVED (revisions required before Migration implementation)

---

## Executive Summary

The initial assessment correctly identified major reuse points and gaps. After Tech Lead review, **9 contract corrections are required** before Gate 1 (Migration) begins. This document incorporates all revisions.

---

## 1. Approved Decisions

| Decision | Status | Reason |
|----------|--------|--------|
| Reuse Supabase auth/storage | ✅ | Existing infrastructure already in place |
| Reuse existing draft/confirmed/rejected lifecycle | ✅ | Aligns with repository and Phase 4B design |
| Reuse existing draft RPC rather than rebuilding | ✅ | Atomic insert/link is the correct persistence boundary |
| Add `source_photos` table | ✅ | Required for Phase 4B tracking |
| Add `source_photo_id`, `crop_box`, `raw_image_url`, `prettify_status` to wardrobe_items | ✅ | Establishes provenance and processing status |
| Introduce provider-independent AI interfaces | ✅ | Core to platform independence |
| Build mock providers before real AI | ✅ | Enables deterministic testing |
| Extend RLS tests with cross-user isolation | ✅ | Critical for security validation |
| Treat Prettify as optional/non-blocking | ✅ | No auto-confirmation of AI-generated items |
| Do not integrate real AI providers in Phase 4B | ✅ | Gate discipline enforced |

---

## 2. Correction 1: Separate State Models (BLOCKER)

**Original design (rejected):**
```ts
type PipelineStatus =
  | 'uploaded'
  | 'detected'
  | 'isolating'
  | 'isolated'
  | 'extracting'
  | 'extracted'
  | 'persisted'
  | 'failed'
```

**Issue:** Combines source-photo lifecycle, item processing lifecycle, and persistence lifecycle into one ambiguous state machine.

**Revised design (required):**
```ts
// Source photo lifecycle (on source_photos table)
export type SourcePhotoStatus =
  | 'uploading'
  | 'detecting'
  | 'done'
  | 'failed'

// Item processing lifecycle (on source_photo_items join; internal pipeline state)
export type ItemProcessingStatus =
  | 'detected'
  | 'isolating'
  | 'isolated'
  | 'extracting'
  | 'extracted'
  | 'failed'

// Wardrobe item lifecycle (on wardrobe_items table; user-facing)
export type WardrobeItemStatus =
  | 'draft'
  | 'confirmed'
  | 'rejected'

// Prettify post-processing (optional, on wardrobe_items column)
export type PrettifyStatus =
  | 'none'
  | 'processing'
  | 'done'
  | 'failed'
```

**Semantics:**
```ts
SourcePhoto {
  status: 'detecting' // actively running detection
}

WardrobeItem A {
  status: 'draft'                 // user-facing state
  processing_status: 'extracting' // internal pipeline state
  prettify_status: 'none'         // optional enhancement state
}

WardrobeItem B {
  status: 'draft'
  processing_status: 'extracted'
  prettify_status: 'processing'   // being improved, still draft
}
```

---

## 3. Correction 2: Keep AI Contracts Provider-Independent (MAJOR)

**Original design (rejected):**
```ts
interface Detection {
  id: string              // ← persistence identifier
  sourcePhotoId: string   // ← persistence identifier
  label: string
  confidence: number
  cropBox: CropBox
}
```

**Issue:** Mixes AI domain (detection model output) with persistence domain (database identifiers).

**Revised design (required):**
```ts
// AI domain: what the detection model outputs
export interface Detection {
  label: string
  confidence: number
  box: CropBox
}

export interface IsolatedItem {
  rawImageUrl: string
  box: CropBox
}

export interface ExtractionResult {
  category: string | null
  subcategory: string | null
  brand: string | null
  color: unknown          // JSON object
  fit: unknown            // JSON object
  styleTags: unknown      // JSON object
  layerRole: string | null
  confidence: number
}

export interface PrettifyResult {
  status: 'queued' | 'processing' | 'done' | 'failed'
  imageUrl?: string
  errorCode?: string
}

// Backend layer adds persistence metadata when storing
export interface DetectedItem {
  detection: Detection
  sourcePhotoId: string
  wardrobe ItemId: string
  itemProcessingStatus: ItemProcessingStatus
}
```

---

## 4. Correction 3: Define CropBox Coordinate System (BLOCKER)

**Original design:** Ambiguous whether coordinates are pixels or normalized.

**Revised design (required):**
```ts
// Normalized coordinates: 0..1 range, image-size-independent
export interface CropBox {
  x: number        // 0 = left edge, 1 = right edge
  y: number        // 0 = top edge, 1 = bottom edge
  width: number    // fraction of image width
  height: number   // fraction of image height
}
```

**Rationale:**

- Works identically for 640×480, 1080×1350, 2048×3072, or any resolution.
- Backend converts normalized to pixel coordinates when rendering/storing.
- AI providers can output normalized coordinates without knowing upstream image resolution.
- Simplifies retry/resume logic (coordinates remain stable across image resizing).

---

## 5. Correction 4: Source Photo vs Derived Item Images (BLOCKER)

**Original design (rejected):**
```ts
source_photos {
  raw_image_url
}

wardrobe_items {
  image_url
}
```

**Revised design (required):**
```ts
source_photos {
  image_url          // original full outfit photo uploaded by user
  file_hash          // for deduplication
  status: SourcePhotoStatus
}

wardrobe_items {
  image_url          // current display image (may be prettified, unconfirmed draft)
  raw_image_url      // isolated garment crop from detection + isolation
  source_photo_id    // provenance link
  crop_box           // normalized coordinates within source photo
  processing_status: ItemProcessingStatus
  prettify_status: PrettifyStatus
}
```

**Semantics:**

```
User uploads outfit.jpg
  ↓
source_photos.image_url = storage URL to outfit.jpg

Detection finds shirt + pants
  ↓
wardrobe_items[0].raw_image_url = storage URL to isolated shirt (cropped)
wardrobe_items[0].crop_box = { x: 0.1, y: 0.2, width: 0.3, height: 0.5 }
wardrobe_items[0].source_photo_id = reference to source_photos row

If prettify runs:
  ↓
wardrobe_items[0].image_url = (updated to prettified shirt if successful)
wardrobe_items[0].prettify_status = 'done'
```

---

## 6. Correction 5: Justify Every State (MAJOR)

**Original design:** Added `processing` state to SourcePhotoStatus without justification.

**Revised design:**

```ts
export type SourcePhotoStatus =
  | 'uploading'   // file transfer in progress
  | 'detecting'   // detection model running
  | 'done'        // detection complete, all items created/failed
  | 'failed'      // detection failed, no items created
```

**Rationale:**

- `uploading` → `detecting` → (`done` | `failed`)
- No intermediate `processing` state is needed; `detecting` covers Stage 2–3 work after upload.
- If processing *after* detection is needed (e.g., post-detection isolation), that state lives on `ItemProcessingStatus`, not `SourcePhotoStatus`.
- Each state must represent an observable API/UI boundary.

---

## 7. Correction 6: SECURITY_DEFINER Ownership Validation (BLOCKER)

**Current RPC (in 0013_create_draft_wardrobe_item_rpc.sql):**
```sql
create or replace function public.create_draft_wardrobe_item(p_image_url text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  created_item_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;
  -- MISSING: verify p_image_url ownership (if applicable)
  -- MISSING: verify source_photo_id ownership (for Phase 4B)
  insert into public.wardrobe_items (image_url, source, status)
  values (p_image_url, 'user_upload', 'draft')
  ...
end;
$$;
```

**Phase 4B requirement:**

Evolve the RPC to accept `source_photo_id` and validate ownership:

```sql
create or replace function public.create_draft_wardrobe_item(
  p_source_photo_id uuid,
  p_raw_image_url text,
  p_crop_box jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid;
  created_item_id uuid;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- CRITICAL: Verify source_photo belongs to current user
  if not exists (
    select 1 from public.source_photos
    where id = p_source_photo_id
      and user_id = current_user_id
  ) then
    raise exception 'Unauthorized: source_photo not owned by user';
  end if;

  insert into public.wardrobe_items (
    source_photo_id,
    raw_image_url,
    crop_box,
    source,
    status,
    processing_status
  )
  values (
    p_source_photo_id,
    p_raw_image_url,
    p_crop_box,
    'user_upload',
    'draft',
    'extracted'
  )
  returning id into created_item_id;

  insert into public.user_wardrobe_items (user_id, item_id, quantity)
  values (current_user_id, created_item_id, 1);

  return created_item_id;
end;
$$;
```

---

## 8. Correction 7: Idempotency is a Requirement, Not a Schema (MAJOR)

**Original design (rejected):**
```ts
source_photos {
  request_id
  file_hash
  unique constraint on (user_id, request_id)
  unique constraint on (user_id, file_hash)
}
```

**Issue:** Combines two unrelated concepts:

- **Idempotency:** One API request must not create duplicate processing.
- **Content deduplication:** Is this physically the same image?

**Revised design:**

Define the requirement first:

```
REQUIREMENT: One logical upload request must not create duplicate source-photo processing.
```

Implement idempotency via:

```ts
source_photos {
  id
  user_id
  image_url
  status: SourcePhotoStatus
  idempotency_key: string    // unique(user_id, idempotency_key)
  file_hash: string          // optional, separate dedup logic if needed
  created_at
}
```

**Semantics:**

- Caller provides `idempotency_key` (e.g., UUID from client).
- Backend checks: does `(user_id, idempotency_key)` already exist?
  - If yes: return existing `source_photos.id`.
  - If no: create new row.
- `file_hash` is optional; used only if content deduplication is a separate feature.

Do not combine them without a use case.

---

## 9. Correction 8: Define Ownership Invariant Explicitly (MAJOR)

**Current relationships:**
```
source_photos
    user_id (owner)
      ↓
wardrobe_items
    source_photo_id (provenance)
      ↓
user_wardrobe_items
    user_id (owner)
```

**Ambiguity:** Which relationship is authoritative?

**Required invariant:**

```ts
// Every user-uploaded wardrobe item must satisfy:
// source_photo.user_id == user_wardrobe_items.user_id

// In SQL:
// Constraint or RLS must enforce:
// EXISTS (
//   SELECT 1 FROM source_photos sp
//   WHERE sp.id = wardrobe_items.source_photo_id
//   AND sp.user_id = (
//     SELECT user_id FROM user_wardrobe_items uwi
//     WHERE uwi.item_id = wardrobe_items.id
//     LIMIT 1
//   )
// )
```

**Implication:** RLS must verify the entire ownership chain:

```
User A can read wardrobe_items where:
  EXISTS (
    SELECT 1 FROM user_wardrobe_items uwi
    WHERE uwi.item_id = wardrobe_items.id
      AND uwi.user_id = auth.uid()
  )
  AND (
    wardrobe_items.source_photo_id IS NULL  -- curated items
    OR EXISTS (
      SELECT 1 FROM source_photos sp
      WHERE sp.id = wardrobe_items.source_photo_id
        AND sp.user_id = auth.uid()
    )
  )
```

---

## 10. Correction 9: Dependency Direction (MAJOR)

**Architecture:**

```
src/lib/pipeline/
├── contracts.ts           # AI domain types (provider-independent)
├── state.ts               # State machines (SourcePhotoStatus, etc.)
├── ai/
│   ├── detector.ts        # interface DetectionProvider
│   ├── isolator.ts        # interface IsolationProvider
│   ├── extractor.ts       # interface ExtractionProvider
│   └── prettifier.ts      # interface PrettifyProvider
├── mocks/
│   ├── detector.mock.ts   # deterministic implementation
│   ├── isolator.mock.ts
│   ├── extractor.mock.ts
│   └── prettifier.mock.ts
├── orchestrator.ts        # uses interfaces, NOT provider SDKs
└── persistence.ts         # Supabase database layer
```

**Dependency direction:**

```
orchestrator.ts
    ↓ depends on
interfaces (DetectionProvider, etc.)
    ↓ implemented by
mocks/ (for Phase 4B)
    ↓ later replaced by
groq-provider/ (Phase 5+)
```

**NEVER:**

```
orchestrator.ts
    ↓ directly imports
@groq/sdk
```

This separation allows:

- AI Engineering to own provider/model decisions independently.
- Backend to own orchestration and persistence.
- Test suite to use mocks without any provider SDK.

---

## 11. Gate 1: Migration Review

Once these 9 corrections are approved, the next gate is:

```
┌─────────────────────────┐
│  Architecture Assessment │  ← Current (Gate 0)
│    PASS WITH CONDITIONS  │
└────────────┬────────────┘
             │
       REVISIONS COMPLETE
             │
             ▼
┌─────────────────────────┐
│  Migration Review       │  ← Gate 1
│  (0014 SQL)             │
└────────────┬────────────┘
             │
        PASS / REJECT
             │
             ▼
┌─────────────────────────┐
│  RLS & Ownership Tests  │  ← Gate 2
│  (test_rls.mjs extend)  │
└────────────┬────────────┘
             │
        PASS / REJECT
             │
             ▼
┌─────────────────────────┐
│  Domain Contracts &     │  ← Gate 3
│  Mock Implementations   │
│  (contracts.ts, mocks/) │
└────────────┬────────────┘
             │
        PASS / REJECT
             │
             ▼
┌─────────────────────────┐
│  Orchestrator           │  ← Gate 4
│  (orchestrator.ts)      │
└────────────┬────────────┘
             │
        PASS / REJECT
             │
             ▼
┌─────────────────────────┐
│  Pipeline Tests         │  ← Gate 5
│  (all stages, failures) │
└────────────┬────────────┘
             │
        PASS / REJECT
             │
             ▼
┌─────────────────────────┐
│  Phase 4B Complete      │
│  (Deterministic,        │
│   no real AI)           │
└─────────────────────────┘
```

---

## 12. Review Classification

Use this classification for all future gate reviews:

| Classification | Action | Next Step |
|---|---|---|
| **PASS** | Proceed to next gate | Implement immediately |
| **PASS WITH CONDITIONS** | Proceed after revisions | Resubmit; do not skip required changes |
| **REJECT** | Do not proceed | Major rework required; resubmit comprehensive plan |

---

## Summary of Required Contract Changes

| Correction | Type | Deliverable |
|-----------|------|-------------|
| 1. Separate state models | BLOCKER | Define `SourcePhotoStatus`, `ItemProcessingStatus`, `WardrobeItemStatus`, `PrettifyStatus` |
| 2. AI contract independence | MAJOR | Remove IDs from AI domain interfaces |
| 3. CropBox coordinates | BLOCKER | Define as normalized 0..1 |
| 4. Source/raw image distinction | BLOCKER | `image_url` on source_photos, `raw_image_url` on wardrobe_items |
| 5. Justify every state | MAJOR | Document observable boundary for each state |
| 6. SECURITY_DEFINER validation | BLOCKER | Extend RPC to verify source_photo ownership |
| 7. Idempotency requirement | MAJOR | Define via `idempotency_key`, separate from `file_hash` |
| 8. Ownership invariant | MAJOR | Document three-way ownership check |
| 9. Dependency direction | MAJOR | Define orchestrator → interfaces → mocks/providers |

---

**Status:** AWAITING TECH LEAD APPROVAL

All 9 corrections incorporated. Ready for Gate 1 (Migration Review).
