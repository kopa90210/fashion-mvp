# Phase 4B — Gate 2 Implementation Plan: RLS & Ownership / State Mutation Authorization

## Goal Description
Implement and enforce the security boundaries for **Phase 4B Gate 2**:
1. **Gate 2A — Ownership & RLS Boundary**:
   - `source_photos` strict isolation (User A $\leftrightarrow$ User B complete isolation across SELECT, INSERT, UPDATE, DELETE).
   - `wardrobe_items` privacy (`source = 'curated'` is readable by authenticated users; `source = 'user_upload'` is readable and updatable ONLY by the owning user linked via `user_wardrobe_items`).
   - Provenance invariant server-side enforcement (`source_photos.user_id = user_wardrobe_items.user_id` when linking derived items).
2. **Gate 2B — State Mutation Authorization**:
   - Prevent direct client mutation of internal pipeline columns (`processing_status`, `prettify_status`).
   - Implement dedicated `SECURITY DEFINER` transition RPCs with strict authentication, ownership checks, and authoritative state machine validation.
   - Defense-in-depth trigger mechanism using transaction-local context (`app.pipeline_transition`) to allow trusted RPCs while blocking direct client tampering.
3. **Hardened Test Suite**:
   - Safe credential handling via environment variables (no hardcoded passwords/keys).
   - Independent Supabase client instances (`clientA`, `clientB`, `serviceClient`).
   - Idempotent and deterministic test fixture seeding.
   - Comprehensive test assertions covering all Gate 2 test matrix groups (positive, negative, cross-user, provenance, invalid state transitions, failures).

---

## Repository Assessment & Compatibility Analysis

| Existing Mechanism | Current Behavior | Phase 4B Requirement | Action | Reason |
| :--- | :--- | :--- | :--- | :--- |
| `0001_initial_schema.sql` (wardrobe_items select) | Allowed any authenticated user to SELECT all `wardrobe_items` | `source = 'curated'` readable; `source = 'user_upload'` private to owner | **MODIFY / REPLACE** | Prevent cross-user data leakage of user garment uploads |
| `0013_create_draft_wardrobe_item_rpc.sql` | Creates draft item without validating or linking `source_photo_id` | Must accept optional `p_source_photo_id` and enforce provenance ownership | **MODIFY** | Ensure provenance invariant `source_photos.user_id = user_wardrobe_items.user_id` |
| `0014_phase4b_source_photo_pipeline.sql` | Created `source_photos` with generic `FOR ALL` policy | Explicit per-operation policies (SELECT, INSERT, UPDATE, DELETE) | **MODIFY** | Granular access control and clear documentation |
| `0015_gate2_state_transition_guard.sql` | Trigger checks `auth.role() = 'authenticated'`, blocking all updates | Block direct client updates while allowing trusted transition RPCs | **REWORK** | Trigger must work in harmony with `SECURITY DEFINER` transition RPCs via transaction context |
| `scripts/test_rls.mjs` | Contained hardcoded test credentials and shared client state | Env-var based config, dual client isolation, comprehensive Gate 2 assertions | **MODIFY** | Security best practice; prevent credential leaks and verify all matrix cases |

---

## Proposed Changes

### Database Migrations & Security RPCs

#### [NEW] [0015_phase4b_gate2_security.sql](file:///f:/project/autofashion/supabase/migrations/0015_phase4b_gate2_security.sql)
*(Replaces/supersedes previous 0015 draft)*
- **RLS Policy Adjustments**:
  - `source_photos`: Explicit policies for `SELECT`, `INSERT`, `UPDATE`, `DELETE` requiring `auth.uid() = user_id`.
  - `wardrobe_items`: Select policy restricted to `source = 'curated' OR EXISTS (SELECT 1 FROM public.user_wardrobe_items uwi WHERE uwi.item_id = wardrobe_items.id AND uwi.user_id = auth.uid())`.
  - `wardrobe_items`: Update policy restricted to owning user on `source = 'user_upload'`.
- **Provenance-Enforcing Draft RPC**:
  - Update `create_draft_wardrobe_item(p_image_url text, p_source_photo_id uuid DEFAULT NULL)`:
    - Validates `auth.uid() is not null`.
    - If `p_source_photo_id` is supplied: verifies `source_photos` exists and `source_photos.user_id = auth.uid()`, raising exception on mismatch.
    - Inserts `wardrobe_items` with `source = 'user_upload'`, `status = 'draft'`, `processing_status = 'detected'`, `prettify_status = 'none'`, `source_photo_id = p_source_photo_id`.
    - Inserts `user_wardrobe_items (user_id, item_id, quantity)`.
- **Authoritative State Transition RPCs**:
  - `transition_wardrobe_item_processing_state(p_item_id uuid, p_target_status text)`:
    - `SECURITY DEFINER`, `SET search_path = public, pg_temp`.
    - Validates caller authentication (`auth.uid() is not null`).
    - Validates ownership via `user_wardrobe_items`.
    - Reads current `processing_status` with row locking (`FOR UPDATE`).
    - Authoritative State Machine Transition Map:
      - `detected` $\rightarrow$ `isolating`, `failed`
      - `isolating` $\rightarrow$ `isolated`, `failed`
      - `isolated` $\rightarrow$ `extracting`, `failed`
      - `extracting` $\rightarrow$ `extracted`, `failed`
      - `failed` $\rightarrow$ `isolating`, `detected`
    - Sets `SET LOCAL app.pipeline_transition = 'true'`.
    - Updates `wardrobe_items.processing_status`.
  - `transition_wardrobe_item_prettify_state(p_item_id uuid, p_target_status text)`:
    - `SECURITY DEFINER`, `SET search_path = public, pg_temp`.
    - Validates authentication and ownership.
    - Validates Prettify State Machine:
      - `none` $\rightarrow$ `processing`
      - `processing` $\rightarrow$ `done`, `failed`
      - `failed` $\rightarrow$ `processing`
    - Sets `SET LOCAL app.pipeline_transition = 'true'`.
    - Updates `wardrobe_items.prettify_status`.
- **Defense-in-Depth Guard Trigger**:
  - Trigger function `guard_wardrobe_item_pipeline_transitions()`:
    - If `nullif(current_setting('app.pipeline_transition', true), '') is null`:
      - If `new.processing_status is distinct from old.processing_status`: `RAISE EXCEPTION 'Direct update of processing_status is forbidden. Pipeline state transitions must use backend orchestrator RPCs.'`.
      - If `new.prettify_status is distinct from old.prettify_status`: `RAISE EXCEPTION 'Direct update of prettify_status is forbidden. Prettify state transitions must use backend orchestrator RPCs.'`.
    - If `app.pipeline_transition = 'true'`: allows update.

---

### Scripts & Test Suites

#### [MODIFY] [scripts/seed_gate2_test_data.mjs](file:///f:/project/autofashion/scripts/seed_gate2_test_data.mjs)
- Ensure deterministic and idempotent fixtures for User A, User B, and a Curated Catalog item.
- Support reading user credentials / IDs dynamically or from environment variables.

#### [MODIFY] [scripts/test_rls.mjs](file:///f:/project/autofashion/scripts/test_rls.mjs)
- Remove all hardcoded keys and credentials; read from environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`, `RLS_TEST_USER_A_EMAIL`, `RLS_TEST_USER_A_PASSWORD`, `RLS_TEST_USER_B_EMAIL`, `RLS_TEST_USER_B_PASSWORD`).
- Instantiate independent clients `clientA` and `clientB`.
- Implement full Gate 2 Test Matrix:
  1. `source_photos` Isolation (A $\rightarrow$ A, B $\rightarrow$ B, A $\rightarrow$ B deny, B $\rightarrow$ A deny for SELECT, UPDATE, DELETE).
  2. `wardrobe_items` Privacy & Curated Catalog (A reads A upload, B reads B upload, A cannot read B upload, B cannot read A upload, Curated readable by both, Curated unmodifiable by clients).
  3. Direct State Mutation Denial (User A direct update to `processing_status` $\rightarrow$ DENY; User A direct update to `prettify_status` $\rightarrow$ DENY).
  4. Trusted RPC Positive Transitions (`detected` $\rightarrow$ `isolating` $\rightarrow$ `isolated` $\rightarrow$ `extracting` $\rightarrow$ `extracted` $\rightarrow$ SUCCESS).
  5. Invalid Transition Denial (`detected` $\rightarrow$ `extracted` $\rightarrow$ DENY; `extracted` $\rightarrow$ `detected` $\rightarrow$ DENY; verify DB state unchanged).
  6. Cross-User RPC Denial (User B attempts transition on User A item $\rightarrow$ DENY; state unchanged).
  7. Provenance Invariant Enforcement (User A creates derived item with User A source photo $\rightarrow$ PASS; User A creates item referencing User B source photo $\rightarrow$ DENIED).
  8. Failure & Edge Cases (Missing item, unauthenticated call, unknown source photo, invalid prettify transition).

---

## Verification Plan

### Automated Test Execution
1. Seed test data:
   ```powershell
   node scripts/seed_gate2_test_data.mjs
   ```
2. Run Gate 2 RLS & State Transition test suite:
   ```powershell
   node scripts/test_rls.mjs
   ```
3. Run existing unit test suites to ensure zero regression:
   ```powershell
   npm test
   ```

### Review Deliverables
- Generate comprehensive Gate 2 report with exact test matrix results, repository assessment, SQL changes, security findings, and Tech Lead recommendation.
