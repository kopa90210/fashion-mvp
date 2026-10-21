# Gate 3: Contracts & Mocks — Entrance Criteria

**Gate Status:** 🟡 Not Started (Awaiting Gate 2 Completion)  
**Objective:** Define contracts, implement SECURITY_DEFINER RPC, mock AI providers  
**Expected Duration:** ~2 days

---

## Overview

Gate 3 bridges between RLS isolation (Gate 2) and working extraction orchestrator (Gate 4). It establishes:

1. **Contracts & Types** — TypeScript interfaces for data contracts
2. **RPC Layer** — SECURITY_DEFINER stored procedures for backend-only state transitions
3. **Mocks & Tests** — Mock AI provider responses; unit tests for orchestrator logic
4. **Validation** — Input validation at both database and application layers

---

## Deliverables

### 3.1 TypeScript Contracts (NEW)

**File:** `src/lib/contracts.ts`

**Scope:**

```typescript
// Canonical types extracted from Gate 1 spec
export interface CropBox {
  x: number;      // 0 ≤ x < 1
  y: number;      // 0 ≤ y < 1
  width: number;  // 0 < width ≤ 1, x + width ≤ 1
  height: number; // 0 < height ≤ 1, y + height ≤ 1
}

export type ProcessingStatus = 
  | 'detected'
  | 'isolating'
  | 'isolated'
  | 'extracting'
  | 'extracted'
  | 'failed';

export type PrettifyStatus = 
  | 'none'
  | 'processing'
  | 'done'
  | 'failed';

export type SourcePhotoStatus =
  | 'uploading'
  | 'detecting'
  | 'done'
  | 'failed';

export type ExtractionStage =
  | 'detection'
  | 'crop'
  | 'background_removal'
  | 'attribute_extraction'
  | 'prettify';

export interface SourcePhoto {
  id: string;
  user_id: string;
  image_url: string;
  status: SourcePhotoStatus;
  idempotency_key?: string;
  file_hash?: string;
  created_at: string;
}

export interface WardrobeItem {
  id: string;
  user_id: string;
  source_photo_id?: string;
  status: 'draft' | 'confirmed' | 'rejected';
  processing_status: ProcessingStatus;
  prettify_status: PrettifyStatus;
  crop_box?: CropBox;
  raw_image_url?: string;
  display_name?: string;
  created_at: string;
  updated_at: string;
}

export interface ExtractionLogEntry {
  id: string;
  source_photo_id: string;
  wardrobe_item_id?: string;
  stage: ExtractionStage;
  status: 'pending' | 'success' | 'failed';
  request_id: string;
  attempt: number;
  error_code?: string;
  created_at: string;
}

// Validation functions
export function validateCropBox(box: unknown): box is CropBox {
  if (typeof box !== 'object' || box === null) return false;
  const { x, y, width, height } = box as Record<string, unknown>;
  return (
    typeof x === 'number' && 0 <= x && x < 1 &&
    typeof y === 'number' && 0 <= y && y < 1 &&
    typeof width === 'number' && 0 < width && width <= 1 &&
    typeof height === 'number' && 0 < height && height <= 1 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

export function validateProcessingStatus(s: unknown): s is ProcessingStatus {
  return ['detected', 'isolating', 'isolated', 'extracting', 'extracted', 'failed'].includes(s as string);
}

// ... similar for other types
```

**Tests:** `src/lib/contracts.test.ts`
- Validate CropBox bounds and invariants
- Validate status enums
- Test validation functions with boundary cases

### 3.2 RPC Layer (NEW)

**File:** `supabase/migrations/0015_phase4b_orchestrator_rpc.sql`

**Key RPCs:**

#### 3.2.1 `create_draft_wardrobe_item`

```sql
create or replace function public.create_draft_wardrobe_item(
  p_source_photo_id uuid,
  p_crop_box jsonb default null
) returns uuid as $$
declare
  v_item_id uuid;
  v_source_user_id uuid;
  v_current_user uuid;
begin
  v_current_user := auth.uid();
  if v_current_user is null then
    raise exception 'Not authenticated';
  end if;

  -- Ownership validation: source_photo must belong to current user
  select user_id into v_source_user_id
    from public.source_photos
    where id = p_source_photo_id;

  if v_source_user_id is null then
    raise exception 'Source photo not found';
  end if;

  if v_source_user_id != v_current_user then
    raise exception 'Cross-user source photo reference denied';
  end if;

  -- Validate crop_box if provided
  if p_crop_box is not null then
    -- TODO: Call contract validation function here
    if not is_valid_crop_box(p_crop_box) then
      raise exception 'Invalid crop_box: bounds or invariants violated';
    end if;
  end if;

  -- Create draft item
  insert into public.wardrobe_items (
    user_id,
    source_photo_id,
    crop_box,
    status,
    processing_status,
    prettify_status,
    created_at,
    updated_at
  ) values (
    v_current_user,
    p_source_photo_id,
    p_crop_box,
    'draft',
    'detected',
    'none',
    now(),
    now()
  ) returning id into v_item_id;

  -- Log creation
  insert into public.extraction_log (
    source_photo_id,
    wardrobe_item_id,
    stage,
    status,
    request_id,
    attempt
  ) values (
    p_source_photo_id,
    v_item_id,
    'detection',
    'success',
    gen_random_uuid()::text,
    1
  );

  return v_item_id;
end;
$$ language plpgsql security definer set search_path = public;

comment on function public.create_draft_wardrobe_item is
  'Backend RPC (SECURITY_DEFINER): Create a draft wardrobe item from source photo.
   Enforces: source_photo ownership == current user.
   Validates: crop_box bounds and invariants.
   Returns: new item UUID.
   Only Backend may call this; exposed via authenticated RPC endpoint.';
```

#### 3.2.2 `update_processing_status`

```sql
create or replace function public.update_processing_status(
  p_item_id uuid,
  p_status text,
  p_log_entry jsonb default null
) returns void as $$
declare
  v_item_user_id uuid;
  v_current_user uuid;
begin
  -- Service role ONLY (enforced at RLS boundary)
  if auth.uid() is not null and auth.uid() != '00000000-0000-0000-0000-000000000000' then
    -- This is a heuristic; true enforcement happens at endpoint level
    raise exception 'update_processing_status: service role only';
  end if;

  -- Validate status
  if not (p_status in ('detected', 'isolating', 'isolated', 'extracting', 'extracted', 'failed')) then
    raise exception 'Invalid processing_status: %', p_status;
  end if;

  -- Update item
  update public.wardrobe_items
    set processing_status = p_status,
        updated_at = now()
    where id = p_item_id;

  -- Log extraction step if provided
  if p_log_entry is not null then
    insert into public.extraction_log (
      wardrobe_item_id,
      stage,
      status,
      request_id,
      attempt,
      error_code
    ) values (
      p_item_id,
      p_log_entry->>'stage',
      p_log_entry->>'status',
      p_log_entry->>'request_id',
      coalesce((p_log_entry->>'attempt')::int, 1),
      p_log_entry->>'error_code'
    );
  end if;
end;
$$ language plpgsql security definer set search_path = public;
```

#### 3.2.3 `update_prettify_status`

Same pattern as `update_processing_status`, but for prettification state transitions.

**Tests:** `supabase/migrations/test_orchestrator_rpc.sql`
- Call `create_draft_wardrobe_item` as authenticated user → succeeds
- Call `create_draft_wardrobe_item` with cross-user source_photo → fails
- Call `create_draft_wardrobe_item` with invalid crop_box → fails
- Call `update_processing_status` as service role → succeeds
- Call `update_processing_status` as authenticated user → fails (enforce at endpoint)

### 3.3 Mock AI Providers (NEW)

**File:** `src/lib/ai-providers/mock.ts`

**Scope:**

```typescript
export interface AIProvider {
  // Synchronous detection (returns crop zones immediately)
  detectGarments(imageUrl: string): Promise<DetectionResult>;
  
  // Async background removal
  removeBackground(imageUrl: string, cropBox: CropBox): Promise<string>;
  
  // Async attribute extraction
  extractAttributes(imageUrl: string): Promise<GarmentAttributes>;
}

export class MockAIProvider implements AIProvider {
  async detectGarments(imageUrl: string): Promise<DetectionResult> {
    // Return fixed test data
    return {
      status: 'success',
      garments: [
        {
          crop_box: { x: 0.1, y: 0.2, width: 0.3, height: 0.5 },
          confidence: 0.95,
        },
      ],
    };
  }

  async removeBackground(imageUrl: string, cropBox: CropBox): Promise<string> {
    // Return mock isolated image URL
    return 'https://example.com/mock-isolated-' + Math.random().toString(36).slice(2);
  }

  async extractAttributes(imageUrl: string): Promise<GarmentAttributes> {
    // Return mock attributes
    return {
      category: 'shirt',
      color: 'blue',
      pattern: 'solid',
      material: 'cotton',
      size: 'm',
    };
  }
}

// Provider factory with fallback
export function getAIProvider(): AIProvider {
  if (process.env.MOCK_AI_PROVIDER === 'true') {
    return new MockAIProvider();
  }
  // Real providers (Phase 4B+)
  throw new Error('Real AI providers not yet implemented');
}
```

**Tests:** `src/lib/ai-providers/mock.test.ts`
- Verify mock provider returns valid DetectionResult
- Verify mock provider returns valid CropBox (validation)
- Verify mock provider returns complete GarmentAttributes

### 3.4 Orchestrator Skeleton (NEW)

**File:** `src/lib/orchestrator/extraction-orchestrator.ts`

**Scope:** High-level orchestration logic (implementation happens in Gate 4).

```typescript
export class ExtractionOrchestrator {
  constructor(
    private db: SupabaseClient,
    private aiProvider: AIProvider
  ) {}

  async processSourcePhoto(sourcePhotoId: string): Promise<void> {
    // Gate 3: skeleton only
    // Gate 4: implement retries, error handling, state machine
    const sourcePhoto = await this.getSourcePhoto(sourcePhotoId);
    
    // Detection stage
    const detection = await this.aiProvider.detectGarments(sourcePhoto.image_url);
    
    // For each garment, create draft item
    for (const garment of detection.garments) {
      await this.createDraftItem(sourcePhotoId, garment.crop_box);
    }
  }

  private async getSourcePhoto(id: string): Promise<SourcePhoto> {
    // Fetch with service role
    const { data, error } = await this.db
      .from('source_photos')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return data;
  }

  private async createDraftItem(sourcePhotoId: string, cropBox: CropBox): Promise<string> {
    // Call RPC (Gate 3 enforces service-role boundary)
    const { data, error } = await this.db.rpc('create_draft_wardrobe_item', {
      p_source_photo_id: sourcePhotoId,
      p_crop_box: cropBox,
    });
    
    if (error) throw error;
    return data;
  }
}
```

**Tests:** `src/lib/orchestrator/extraction-orchestrator.test.ts`
- Mock AI provider
- Call `processSourcePhoto` with test data
- Verify RPC is called with correct arguments
- Verify error handling (e.g., invalid crop_box)

---

## Gate 3 Checklist

- [ ] TypeScript contracts defined (src/lib/contracts.ts)
- [ ] Contract validation functions implemented and tested
- [ ] CropBox validation covers all bounds and invariants
- [ ] Status enums match database CHECK constraints
- [ ] RPC migration created (0015_phase4b_orchestrator_rpc.sql)
- [ ] `create_draft_wardrobe_item` RPC validates source_photo ownership
- [ ] `create_draft_wardrobe_item` RPC validates crop_box
- [ ] `update_processing_status` RPC enforces service-role boundary
- [ ] `update_prettify_status` RPC enforces service-role boundary
- [ ] Mock AI provider implemented
- [ ] Mock provider returns valid test data
- [ ] Orchestrator skeleton created
- [ ] All contracts tests PASS
- [ ] All RPC tests PASS
- [ ] All orchestrator unit tests PASS

---

## Gate 3 Success Criteria

**PASS** when:

1. **Contracts:**
   - All TypeScript types match database schema
   - Validation functions correctly enforce invariants
   - Invalid inputs are rejected

2. **RPC Layer:**
   - `create_draft_wardrobe_item` succeeds for same-user source_photo
   - `create_draft_wardrobe_item` fails for cross-user source_photo
   - `create_draft_wardrobe_item` fails for invalid crop_box
   - State transitions via RPC succeed (with mock auth)
   - All RPCs properly logged to extraction_log

3. **Mocks:**
   - Mock provider returns consistent test data
   - Mock provider responses are validated against contracts
   - Orchestrator skeleton integrates with mock provider without errors

4. **No new RLS issues:**
   - All Phase 2-3 tests still pass
   - No regressions in user isolation

**FAIL** if:
- Contracts don't match database schema
- RPC ownership validation is missing or incorrect
- Cross-user access is possible via RPC
- Mock provider returns invalid data
- Orchestrator doesn't handle errors gracefully

---

## Gate 3 Tech Lead Review Criteria

**BLOCKER:**
- RPC missing ownership validation
- Contracts don't enforce database CHECK constraints
- Service-role boundary not enforced at endpoint level

**MAJOR:**
- Mock provider returns incomplete data
- Validation functions miss edge cases
- CropBox validation is permissive or incorrect

**MINOR:**
- Comments need clarification
- Test coverage < 90%
- Error messages could be more descriptive

---

## Timeline

- Day 1: Contracts & types, validation functions, tests
- Day 2: RPC layer, mock providers, orchestrator skeleton
- Day 2 PM: Code review, bug fixes, Gate 3 sign-off

---

## References

- Gate 1 Review: [PHASE_4B_GATE1_REVIEW.md](PHASE_4B_GATE1_REVIEW.md)
- Gate 2 Test Plan: [PHASE_4B_GATE2_TEST_PLAN.md](PHASE_4B_GATE2_TEST_PLAN.md)
- Migration: [supabase/migrations/0014_phase4b_source_photo_pipeline.sql](supabase/migrations/0014_phase4b_source_photo_pipeline.sql)
