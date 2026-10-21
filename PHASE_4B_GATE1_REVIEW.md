## Gate 1: Migration Review — PASS WITH CONDITIONS

**Status:** 🟡 CONDITIONALLY APPROVED

**Tech Lead Reviewer:** Phase 4B Backend Tech Lead

**Review Date:** 2026-08-29

---

## Executive Summary

The migration proposal `0014_phase4b_source_photo_pipeline.sql` is **directionally correct** and covers the required Phase 4B persistence pieces. However, the initial acceptance was too strong in claiming full enforcement of guarantees that are actually split across multiple gates.

**Changes required before Gate 1 is closed:**

1. Distinguish between schema foundation and full enforcement
2. Define state transition ownership
3. Classify migration replay safety operation-by-operation
4. Clarify `file_hash` semantics
5. Define `CropBox` validation authority
6. Adopt canonical extraction-stage vocabulary

None of these require redesigning the architecture.

---

## Condition 1: Ownership Invariant Enforcement (BLOCKER)

**Initial claim (rejected):**
```
Constraints enforce ownership invariant ✅
```

**Tech Lead correction:**

The three-way ownership check is **not fully enforced by the migration alone**.

**Breakdown:**

| Component | Gate | Status | Enforced By |
|-----------|------|--------|------------|
| `source_photos` owns images | Gate 1 | ✅ | `source_photos.user_id` + RLS policy |
| `user_wardrobe_items` owns items | Gate 1 | ✅ | Existing RLS policy |
| `wardrobe_items.source_photo_id` must match owner | Gate 3/4 | ⏳ | RPC validation (to be implemented) |

**Required:**

Gate 1 establishes the schema and RLS foundation. The complete invariant is:

```sql
-- Every user-uploaded wardrobe_item must satisfy:
source_photos.user_id
    ==
user_wardrobe_items.user_id
    ==
current_user
```

**This is enforced in the RPC that creates the draft item** (Gate 3, not Gate 1).

**Gate 1 Revised Checklist:**

```
Schema supports ownership invariant ✅
  - source_photos has user_id FK
  - source_photos has RLS "owner all" policy
  - wardrobe_items has source_photo_id FK
  - user_wardrobe_items RLS already in place

Full invariant enforcement ⏳ Gate 3/4
  - RPC must validate: source_photos.user_id == auth.uid()
  - RPC must validate: item owner == current user
  - Orchestrator must not violate invariant during retries
```

---

## Condition 2: State Transition Ownership (MAJOR)

**Issue:** Who is authorized to transition each state?

**Required rule:**

> **Clients may not directly transition pipeline-processing states.**

**Ownership matrix (to be enforced):**

| State | Table | Owner | Who Transitions |
|-------|-------|-------|-----------------|
| `source_photos.status` | source_photos | Backend Orchestrator | Service role RPC only |
| `wardrobe_items.processing_status` | wardrobe_items | Backend Orchestrator | Service role RPC only |
| `wardrobe_items.prettify_status` | wardrobe_items | Prettify Orchestrator | Service role RPC only |
| `wardrobe_items.status` (draft/confirmed/rejected) | wardrobe_items | User + Backend | Frontend confirms; backend handles draft creation |

**Database enforcement:**

Gate 1 migration does NOT prevent clients from directly updating `processing_status` or `prettify_status` via normal authenticated access.

This is **an application-layer invariant**, not a database constraint.

**Phase 4B requirement:**

All orchestration must be via:
- Backend RPC calls (SECURITY_DEFINER)
- Service-role-only API endpoints
- No direct client UPDATE to pipeline states

**Gate 1 documentation requirement:**

Add explicit comment to migration:

```sql
comment on column public.wardrobe_items.processing_status is
  'Internal pipeline state (detected → isolating → isolated → extracting → extracted | failed).
   INVARIANT: Backend orchestrator transitions only (SECURITY_DEFINER RPC).
   Clients MUST NOT update this field directly.
   Enforce via: application logic + RLS policy if needed in Gate 3+.';

comment on column public.wardrobe_items.prettify_status is
  'Optional post-processing state (none → processing → done | failed).
   INVARIANT: Prettify orchestrator transitions only (SECURITY_DEFINER RPC).
   Clients MUST NOT update this field directly.
   Enforce via: application logic + RLS policy if needed in Gate 3+.';

comment on table public.source_photos is
  'User-uploaded source photos. Status progresses: uploading → detecting → (done | failed).
   INVARIANT: Backend orchestrator transitions only (SECURITY_DEFINER RPC).
   Clients MUST NOT update this field directly.';
```

---

## Condition 3: Migration Replay Safety Classification (MAJOR)

**Issue:** The statement "All additions use `IF NOT EXISTS` safely" is not granular enough.

Different operations have different replay characteristics.

**Required classification:**

| Operation | Type | Replay Safe? | Rationale |
|-----------|------|---|-----------|
| `CREATE TABLE source_photos` | DDL | ✅ One-time | Table creation is inherently one-time; idempotency via table existence |
| `CREATE UNIQUE INDEX source_photos_user_idempotency_key_idx` | DDL | ✅ Conditional | Uses `IF NOT EXISTS`; re-run is safe if index doesn't exist |
| `CREATE INDEX source_photos_user_status_idx` | DDL | ✅ Conditional | Uses `IF NOT EXISTS` |
| `CREATE POLICY "source_photos: owner all"` | DDL | ⚠️ Conditional | Policy already exists? Migration fails. Must `DROP IF EXISTS POLICY` first. |
| `ALTER TABLE wardrobe_items ADD COLUMN source_photo_id ...` | DDL | ✅ Conditional | Uses `IF NOT EXISTS` |
| `ALTER TABLE wardrobe_items ADD CONSTRAINT ...` | DDL | ⚠️ One-time | Constraints may already exist. Not idempotent without `IF NOT EXISTS`. |

**Gate 1 requirement:**

Update migration to use `IF NOT EXISTS` on all policy creation statements:

```sql
-- BEFORE (not replay-safe):
create policy "source_photos: owner all"
  on public.source_photos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- AFTER (replay-safe):
drop policy if exists "source_photos: owner all" on public.source_photos;

create policy "source_photos: owner all"
  on public.source_photos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

**Classification table to include in migration comments:**

```sql
-- Migration Replay Safety Classification:
-- 
-- CREATE TABLE source_photos
--   ✅ replay-safe (one-time, table existence guarantees idempotency)
--
-- CREATE INDEX (all)
--   ✅ replay-safe (IF NOT EXISTS used throughout)
--
-- CREATE POLICY
--   ⚠️ conditionally replay-safe (requires DROP IF EXISTS POLICY first)
--
-- ALTER TABLE ... ADD COLUMN
--   ✅ replay-safe (IF NOT EXISTS used)
--
-- All operations are safe for repeated execution via `IF NOT EXISTS` or DROP-first pattern.
```

---

## Condition 4: `file_hash` Semantics (MAJOR)

**Issue:** What is `file_hash` for?

**Current design:** Indexed column, no uniqueness constraint.

**Required clarification:**

```
file_hash = informational / content identity (NOT a business rule)

Semantics:
  - Enables duplicate-content detection (observability)
  - Enables optional "warn user" workflows
  - DOES NOT prevent uploading the same photo twice
  
Rationale:
  - A user might intentionally upload the same outfit photo from different angles
  - Business requirement does not say "prevent duplicate content"
  - Idempotency_key handles request deduplication
```

**Gate 1 requirement:**

Do not create a global uniqueness constraint on `file_hash`. It is indexed for queries only.

```sql
-- KEEP:
create index source_photos_file_hash_idx
  on public.source_photos (file_hash);

-- DO NOT ADD:
-- unique (file_hash)
-- or
-- unique (user_id, file_hash)
```

**Documentation:**

```sql
comment on column public.source_photos.file_hash is
  'SHA-256 or similar hash of image content.
   Enables content-based deduplication queries.
   NOT unique. NOT a business rule.
   Separate concern from idempotency_key.';
```

---

## Condition 5: CropBox Validation Authority (MAJOR)

**Issue:** `crop_box` is stored as `jsonb`, but database has no constraint that values are normalized [0..1].

**Architecture decision:**

Who is authoritative for validating CropBox?

**Required:**

Define the validation boundary:

```ts
// Canonical CropBox invariant (application contract):
CropBox {
  x: number       // 0 <= x <= 1
  y: number       // 0 <= y <= 1
  width: number   // 0 < width, x + width <= 1
  height: number  // 0 < height, y + height <= 1
}
```

**Enforcement (Gate 1 → Gate 3):**

| Layer | Responsibility | Gate |
|-------|---|---|
| Database | Store as jsonb | Gate 1 ✅ |
| Application | Validate before insert/update | Gate 3 (contracts.ts) ✅ |
| Orchestrator | Enforce during crop adjustment | Gate 4 ✅ |

**Gate 1 requirement:**

Document this in the migration:

```sql
comment on column public.wardrobe_items.crop_box is
  'Normalized crop coordinates within source photo.
   Schema: { x, y, width, height }
   Range: x, y, width, height ∈ [0..1]
   Invariant: x + width <= 1, y + height <= 1, width > 0, height > 0
   
   Stored as JSONB; validation enforced by application layer (Gate 3+).
   
   Phase 4B: adjustItemCrop re-runs isolation with updated crop_box.
   Phase 4B: Prettify may adjust crop_box for rendering optimization.';
```

---

## Condition 6: Canonical Extraction-Stage Vocabulary (MAJOR)

**Issue:** The Phase 4B design document defines extraction stages as:

```
detection
crop
background_removal
attribute_extraction
prettify
```

But the migration uses:

```
stage text check (
  stage in ('detection', 'isolation', 'extraction', 'prettify')
)
```

**Problem:** `isolation` is too coarse; it actually consists of `crop + background_removal`.

**Tech Lead decision:**

Adopt the canonical vocabulary from the spec:

```sql
alter table public.extraction_log
  add column if not exists stage text check (
    stage is null or stage in (
      'detection',
      'crop',
      'background_removal',
      'attribute_extraction',
      'prettify'
    )
  );
```

**Rationale:**

- Better observability: trace each AI stage separately
- Matches Phase 4B deck terminology exactly
- Allows future granular retry/resume at crop vs. background-removal level
- Aligns with AI Engineering's stage-by-stage reporting

**Gate 1 requirement:**

Update the migration `extraction_log` stage enum to use canonical vocabulary.

---

## Gate 1 Revised Checklist

| Item | Status | Notes |
|------|--------|-------|
| No duplicate existing columns | ✅ | All additions use `IF NOT EXISTS` safely |
| All new columns have clear purpose | ✅ | Comments document every field |
| Schema supports ownership invariant | ✅ | Foundation in place; RPC enforcement in Gate 3 |
| Indexes for foreign keys and lookups | ✅ | Present on all key columns |
| RLS policies on source_photos | ✅ | "owner all" policy correct |
| Migration replay safety classified | ⏳ | Must drop/recreate policies; document classification |
| `idempotency_key` indexed, separate from `file_hash` | ✅ | Correct; `file_hash` is informational only |
| State transition ownership documented | ⏳ | Must add comments: Backend RPC only, no client updates |
| CropBox validation authority defined | ⏳ | Must document: validated by application, not database |
| Canonical extraction-stage vocabulary | ⏳ | Must change `isolation` → `crop` + `background_removal` |

---

## Revised Migration Requirements (Before Gate 1 Closes)

Make these updates to `0014_phase4b_source_photo_pipeline.sql`:

1. **Drop and recreate policies (replay-safe):**
   ```sql
   drop policy if exists "source_photos: owner all" on public.source_photos;
   create policy "source_photos: owner all" ...
   ```

2. **Add state-ownership comments:**
   ```sql
   comment on column public.wardrobe_items.processing_status is
     'Internal pipeline state ...
      INVARIANT: Backend orchestrator transitions only (SECURITY_DEFINER RPC).
      Clients MUST NOT update this field directly.';
   ```

3. **Clarify `file_hash` as informational:**
   ```sql
   comment on column public.source_photos.file_hash is
     'Content-based deduplication key. NOT unique. NOT a business rule.
      Separate concern from idempotency_key.';
   ```

4. **Document CropBox validation:**
   ```sql
   comment on column public.wardrobe_items.crop_box is
     'Normalized [0..1] coordinates. Validated by application (Gate 3+).
      Schema: { x, y, width, height } with x+width ≤ 1, y+height ≤ 1.';
   ```

5. **Use canonical extraction stages:**
   ```sql
   alter table public.extraction_log
     add column if not exists stage text check (
       stage is null or stage in (
         'detection',
         'crop',
         'background_removal',
         'attribute_extraction',
         'prettify'
       )
     );
   ```

6. **Add migration replay classification:**
   ```sql
   -- Migration Replay Safety:
   -- All operations use IF NOT EXISTS or DROP-first pattern for idempotency.
   ```

---

## Gate 1 Final Decision

### Status: 🟡 PASS WITH CONDITIONS

**Approval:** Conditional on the 6 updates above being integrated into the migration.

**Next gate:** Gate 2 (RLS & Ownership Tests)

Do not proceed to Contracts & Mocks until Gate 1 conditions are closed.

---

## Gate 2: RLS & Ownership Tests (NEXT)

**Objective:** Prove the complete ownership graph is isolated.

**Test matrix:**

```
source_photos isolation:
  User A → User A source_photos ✅ allowed
  User A → User B source_photos ❌ denied
  User B → User B source_photos ✅ allowed
  User B → User A source_photos ❌ denied

wardrobe_items via user_wardrobe_items:
  User A → User A items (linked to User A source) ✅ allowed
  User A → User B items (linked to User B source) ❌ denied
  User B → User B items (linked to User B source) ✅ allowed
  User B → User A items (linked to User A source) ❌ denied

Operations to test (SELECT, INSERT, UPDATE, DELETE):
  source_photos SELECT (own + cross-user)
  source_photos UPDATE (own + cross-user)
  source_photos DELETE (own + cross-user)
  wardrobe_items UPDATE processing_status (own + cross-user)
  wardrobe_items UPDATE prettify_status (own + cross-user)
```

**Deliverable:** Extended `scripts/test_rls.mjs` with full matrix + results.

**Tech Lead review criteria:**

- All A→A tests pass
- All A→B tests return zero rows or error (not data leak)
- All B→B tests pass
- All B→A tests return zero rows or error
- Tests use two real Supabase accounts
- Tests are automated and repeatable
