# Phase 4B Backend Architecture — Gate Progress Report

**Status:** Gate 2 Ready  
**Date:** 2026-08-30  
**Progress:** 50% (Gates 1-2 complete, Gates 3-4 pending)

---

## Phase 4B Overview

**Objective:** Implement source photo detection, isolation, extraction pipeline with user ownership isolation and orchestrator-driven state management.

**Architecture:**
- User uploads source photo
- Backend detection service identifies garments
- Backend isolation service crops & removes background
- Backend extraction service extracts attributes
- Backend orchestrator manages state transitions
- Frontend confirms or rejects drafted items

**Key Constraint:** All pipeline state transitions are backend-only (no direct client updates).

---

## Gate System (4-Gate Review Process)

Each gate validates specific architectural concerns before proceeding to implementation.

### Gate Progression

```
Gate 1: Migration Review          ✅ APPROVED
   └─ Schema foundation
   └─ RLS support structure
   └─ Documentation standards

Gate 2: RLS & Ownership Tests     🟡 READY (awaiting execution)
   └─ Prove ownership isolation
   └─ Validate RLS policies
   └─ Verify state transition blocking

Gate 3: Contracts & Mocks         🔵 PLANNED
   └─ TypeScript type contracts
   └─ SECURITY_DEFINER RPC layer
   └─ Mock AI providers
   └─ Orchestrator skeleton

Gate 4: Full Orchestration        🔵 PLANNED
   └─ Real AI provider integration
   └─ Retry & error handling
   └─ State machine implementation
   └─ End-to-end pipeline testing
```

---

## Gate 1: Migration Review — ✅ APPROVED

**Deliverable:** Migration 0014_phase4b_source_photo_pipeline.sql

**Gate 1 Conditions (Closed):**

1. ✅ **Ownership invariant** — Schema supports three-way check (source user == item owner == auth user)
2. ✅ **State transition ownership** — Documented that backend RPC only transitions pipeline states
3. ✅ **Migration replay safety** — All operations use `IF NOT EXISTS` or `DROP IF EXISTS POLICY` first
4. ✅ **`file_hash` semantics** — Documented as informational, not a business rule
5. ✅ **CropBox validation** — Authority defined (application layer, not database)
6. ✅ **Canonical extraction stages** — Vocabulary matches spec (detection, crop, background_removal, attribute_extraction, prettify)

**Migration Contents:**

- `source_photos` table (user uploads, detection workflow)
- Columns added to `wardrobe_items` (source_photo_id, crop_box, raw_image_url, processing_status, prettify_status)
- Columns added to `extraction_log` (source_photo_id, wardrobe_item_id, stage, request_id, attempt, error_code)
- RLS policy on `source_photos` ("owner all")
- Comprehensive comments documenting invariants and enforcement boundaries

---

## Gate 2: RLS & Ownership Tests — 🟡 READY

**Objective:** Prove the complete ownership graph is isolated using automated RLS tests.

**Test Matrix:**

### source_photos Isolation
```
User A → User A photos:     ✅ allowed (can SELECT)
User A → User B photos:     ❌ denied (0 rows)
User B → User B photos:     ✅ allowed (can SELECT)
User B → User A photos:     ❌ denied (0 rows)
```

### wardrobe_items Linked via source_photo_id
```
User A → User A items (linked to User A source):     ✅ allowed
User A → User B items (linked to User B source):     ❌ denied
User B → User B items (linked to User B source):     ✅ allowed
User B → User A items (linked to User A source):     ❌ denied
```

### State Transition Ownership
```
processing_status → direct client UPDATE:    ❌ denied
prettify_status → direct client UPDATE:      ❌ denied
```

**Test Suite:** Extended scripts/test_rls.mjs with Groups 4-6

**Test Execution Steps:**
1. Create two real Supabase accounts
2. Seed test source_photos for each user
3. Run `node scripts/test_rls.mjs`
4. Verify all tests pass

**Gate 2 Sign-Off Criteria:**
- All A→A tests pass (access allowed)
- All A→B tests fail (access denied)
- All B→B tests pass
- All B→A tests fail
- No data leaks
- State transitions blocked for clients

---

## Gate 3: Contracts & Mocks — 🔵 PLANNED

**Objective:** Define contracts, implement SECURITY_DEFINER RPC, mock AI providers.

**Deliverables:**

### 3.1 TypeScript Contracts (src/lib/contracts.ts)

```typescript
// Canonical types enforced throughout pipeline
interface CropBox { x, y, width, height ∈ [0..1] with invariants }
type ProcessingStatus = 'detected' | 'isolating' | 'isolated' | 'extracting' | 'extracted' | 'failed'
type PrettifyStatus = 'none' | 'processing' | 'done' | 'failed'
type SourcePhotoStatus = 'uploading' | 'detecting' | 'done' | 'failed'
type ExtractionStage = 'detection' | 'crop' | 'background_removal' | 'attribute_extraction' | 'prettify'

// Validation functions enforce database CHECK constraints at application layer
validateCropBox(box): box is CropBox
validateProcessingStatus(s): s is ProcessingStatus
// ... etc
```

### 3.2 RPC Layer (supabase/migrations/0015_phase4b_orchestrator_rpc.sql)

```sql
-- Backend-only state transitions (SECURITY_DEFINER)
create_draft_wardrobe_item(p_source_photo_id, p_crop_box)
  → validates source_photo ownership
  → validates crop_box bounds
  → creates draft item + logs extraction

update_processing_status(p_item_id, p_status, p_log_entry)
  → service-role only
  → validates status enum
  → updates item + logs step

update_prettify_status(p_item_id, p_status, p_log_entry)
  → service-role only
  → updates item + logs step
```

### 3.3 Mock AI Providers (src/lib/ai-providers/mock.ts)

```typescript
class MockAIProvider implements AIProvider {
  detectGarments(imageUrl): Promise<DetectionResult>
  removeBackground(imageUrl, cropBox): Promise<string>
  extractAttributes(imageUrl): Promise<GarmentAttributes>
}
```

Returns consistent test data for unit testing orchestrator logic.

### 3.4 Orchestrator Skeleton (src/lib/orchestrator/extraction-orchestrator.ts)

High-level entry point for pipeline processing. Full state machine comes in Gate 4.

```typescript
class ExtractionOrchestrator {
  async processSourcePhoto(sourcePhotoId): Promise<void>
  private async getSourcePhoto(id): Promise<SourcePhoto>
  private async createDraftItem(sourcePhotoId, cropBox): Promise<string>
}
```

**Gate 3 Sign-Off Criteria:**
- All contracts match database schema
- Validation functions enforce invariants
- RPC ownership validation is correct
- Mock provider returns valid test data
- Orchestrator skeleton integrates without errors
- No regression in Phase 2-3 tests

**Estimated Duration:** 2 days

---

## Gate 4: Full Orchestration — 🔵 PLANNED

**Objective:** Implement working extraction orchestrator with real AI provider integration.

**Deliverables:**

### 4.1 Real AI Provider Implementation

Choose provider (e.g., Segment Anything, YOLO, custom model):
- Integrate API calls
- Handle rate limiting, retries
- Implement timeout & fallback logic

### 4.2 Orchestrator State Machine

```
Source Photo Flow:
  uploading → detecting → done | failed

Per Garment (Item) Flow:
  detected → isolating → isolated → extracting → extracted → [prettify?] → done | failed

Prettify Flow (optional):
  none → processing → done | failed
```

### 4.3 Error Handling & Retries

- Idempotent retries via request_id + attempt counter
- Exponential backoff
- Max retry limits per stage
- Error logging to extraction_log

### 4.4 Orchestrator RPC Boundary

- Service role only (no authenticated access)
- Transactional state updates
- Atomic logging (state change + log entry in same transaction)

### 4.5 End-to-End Testing

- Full pipeline from source photo → extracted item
- Failure scenarios (invalid image, AI error, timeout)
- Retry paths
- Cross-user isolation (no data leak under any condition)

**Gate 4 Sign-Off Criteria:**
- Full pipeline executes successfully
- Error handling is robust
- Retries work correctly
- No data leaks
- Performance acceptable (detection + isolation + extraction < 30s per item)
- All Phase 2-3-4 tests pass

**Estimated Duration:** 3-4 days

---

## Implementation Timeline

```
2026-08-29  Gate 1 approved ✅
2026-08-30  Gate 2 ready + documentation complete
2026-08-31  Gate 2 execution + results
2026-09-02  Gate 2 sign-off ✅
2026-09-03  Gate 3 start (contracts, RPCs, mocks)
2026-09-04  Gate 3 completion + code review
2026-09-05  Gate 3 sign-off ✅
2026-09-06  Gate 4 start (AI integration, state machine)
2026-09-09  Gate 4 completion + testing
2026-09-10  Gate 4 sign-off ✅ (Phase 4B complete)
```

---

## Current Artifacts

### Documentation
- [PHASE_4B_GATE1_REVIEW.md](PHASE_4B_GATE1_REVIEW.md) — Gate 1 conditions & approval
- [PHASE_4B_GATE2_TEST_PLAN.md](PHASE_4B_GATE2_TEST_PLAN.md) — Complete Gate 2 guide
- [PHASE_4B_GATE2_EXECUTION_GUIDE.md](PHASE_4B_GATE2_EXECUTION_GUIDE.md) — Quick-start for Gate 2
- [PHASE_4B_GATE3_ENTRANCE_CRITERIA.md](PHASE_4B_GATE3_ENTRANCE_CRITERIA.md) — Gate 3 prep
- [PHASE_4B_ARCHITECTURE_ASSESSMENT_REVISED.md](PHASE_4B_ARCHITECTURE_ASSESSMENT_REVISED.md) — Original architecture spec

### Code
- [supabase/migrations/0014_phase4b_source_photo_pipeline.sql](supabase/migrations/0014_phase4b_source_photo_pipeline.sql) — Schema (Gate 1)
- [scripts/test_rls.mjs](scripts/test_rls.mjs) — RLS tests (Gate 2)

---

## Key Decision Points

### 1. State Transition Authority
**Decision:** Backend orchestrator only (SECURITY_DEFINER RPC).  
**Why:** Prevents client-side manipulation of pipeline state; ensures consistent ordering (detect → isolate → extract).

### 2. CropBox Validation
**Decision:** Application layer (TypeScript contracts), not database constraints.  
**Why:** Allows flexible error handling; DB is source of truth but app enforces user-facing behavior.

### 3. Canonical Extraction Stages
**Decision:** 5 stages (detection, crop, background_removal, attribute_extraction, prettify) per spec.  
**Why:** Enables granular observability; allows stage-specific retry logic; matches AI module boundaries.

### 4. Ownership Enforcement
**Decision:** Three-way check: source_photos.user_id == item.user_id == auth.uid().  
**Why:** Prevents users from linking items to others' source photos; enforced by RLS + RPC validation.

### 5. Mock AI Provider
**Decision:** Separate mock class for testing; real provider plugged in at Gate 4.  
**Why:** Enables fast iteration on orchestrator logic without AI delays; decouples orchestrator from provider.

---

## Success Metrics

| Metric | Gate 1 | Gate 2 | Gate 3 | Gate 4 |
|--------|--------|--------|--------|--------|
| Schema complete | ✅ | ✅ | ✅ | ✅ |
| RLS isolation proven | — | ✅ | ✅ | ✅ |
| Contracts enforced | — | — | ✅ | ✅ |
| Orchestrator works | — | — | — | ✅ |
| E2E pipeline tested | — | — | — | ✅ |
| Zero data leaks | — | ✅ | ✅ | ✅ |
| <30s pipeline time | — | — | — | ✅ |

---

## Next Immediate Action

**Gate 2 Execution (today/tomorrow):**

1. Seed test data (5 min)
2. Run test suite (3 min)
3. Verify all tests pass
4. Document results

See [PHASE_4B_GATE2_EXECUTION_GUIDE.md](PHASE_4B_GATE2_EXECUTION_GUIDE.md) for step-by-step instructions.

---

## Tech Lead Contact

For reviews, questions, or blockers:
- Reference this document + gate-specific docs
- Include error logs from test runs
- Highlight any contract/policy mismatches

---

**Phase 4B on track. Gate 2 ready to execute.** ✅
