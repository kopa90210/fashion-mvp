# Phase 4B — Gate 2 Walkthrough: RLS / Ownership & State Mutation Authorization

## Executive Summary

Phase 4B Gate 2 implementation establishes and verifies two foundational security boundaries for `kopa90210/fashion-mvp`:
1. **Boundary A (Ownership & Isolation):** Strict cross-user isolation across the Phase 4B ownership graph (`source_photos` $\rightarrow$ `wardrobe_items.source_photo_id` $\rightarrow$ `user_wardrobe_items`), preventing any user from reading or mutating another user's photos or garment uploads, while maintaining public authenticated access to the shared curated catalog.
2. **Boundary B (Pipeline State Mutation Authorization):** Direct client tampering with pipeline columns (`processing_status`, `prettify_status`) is blocked at the database level via a defense-in-depth trigger, and state transitions are strictly governed by hardened `SECURITY DEFINER` RPCs enforcing an authoritative state machine.

---

## Deliverables

### A. Repository Assessment

| Existing Mechanism | Previous Behavior | Phase 4B Requirement | Action & Decision |
| :--- | :--- | :--- | :--- |
| `0001_initial_schema.sql` (`wardrobe_items` SELECT) | Allowed any authenticated user to SELECT all rows in `wardrobe_items`, leaking user uploads. | Curated catalog items (`source = 'curated'`) readable by all; user uploads (`source = 'user_upload'`) private to owner. | **REPLACED** with scoped policy `wardrobe_items: select curated or own`. |
| `0013_create_draft_wardrobe_item_rpc.sql` | Created draft item without accepting or validating `source_photo_id`. | Must support optional `p_source_photo_id` and enforce `source_photos.user_id = auth.uid()`. | **UPGRADED** to enforce provenance ownership invariant. |
| `0014_phase4b_source_photo_pipeline.sql` | Used generic `FOR ALL` policy on `source_photos`. | Explicit, granular policies for `SELECT`, `INSERT`, `UPDATE`, `DELETE`. | **HARDENED** with explicit per-operation policies. |
| `0015_gate2_state_transition_guard.sql` | Trigger checked `auth.role() = 'authenticated'`, which would block even trusted `SECURITY DEFINER` RPCs called from client sessions. | Block direct client updates while allowing trusted backend RPC transitions. | **REWORKED** to use transaction-local session setting `app.pipeline_transition`. |
| `scripts/test_rls.mjs` | Contained hardcoded credentials and reused a single Supabase client. | Env-var based secrets, dual isolated client instances (`clientA`, `clientB`), and full test matrix. | **REWRITTEN** to follow strict credential hygiene and complete assertions. |

---

### B. Security Design

```text
       Client Request
             │
             ├── Direct UPDATE processing_status? ──────► [TRIGGER CHECK] ──► DENY (Exception)
             │
             └── Call transition RPC
                      │
                      ▼
         [SECURITY DEFINER RPC]
         (search_path = public, pg_temp)
                      │
                      ├── 1. auth.uid() != null?
                      ├── 2. Caller owns item via user_wardrobe_items?
                      ├── 3. Valid transition per State Machine?
                      │
                      ▼
         SET LOCAL app.pipeline_transition = 'true'
                      │
                      ▼
         UPDATE wardrobe_items SET status = target
                      │
                      ▼
         [TRIGGER: app.pipeline_transition == 'true'] ──► ALLOW
```

#### 1. Ownership & RLS
- **`source_photos`**: Strict ownership where `auth.uid() = user_id` for `SELECT`, `INSERT`, `UPDATE`, and `DELETE`.
- **`wardrobe_items`**:
  - `SELECT`: `source = 'curated' OR EXISTS (SELECT 1 FROM user_wardrobe_items uwi WHERE uwi.item_id = wardrobe_items.id AND uwi.user_id = auth.uid())`
  - `INSERT`: `auth.uid() IS NOT NULL AND source = 'user_upload'`
  - `UPDATE`: `source = 'user_upload' AND EXISTS (SELECT 1 FROM user_wardrobe_items uwi WHERE uwi.item_id = wardrobe_items.id AND uwi.user_id = auth.uid())`

#### 2. Authoritative State Machines
- **Processing State Machine**:
  - `detected` $\rightarrow$ `isolating`, `failed`
  - `isolating` $\rightarrow$ `isolated`, `failed`
  - `isolated` $\rightarrow$ `extracting`, `failed`
  - `extracting` $\rightarrow$ `extracted`, `failed`
  - `failed` $\rightarrow$ `isolating`, `detected`
- **Prettify State Machine**:
  - `none` $\rightarrow$ `processing`
  - `processing` $\rightarrow$ `done`, `failed`
  - `failed` $\rightarrow$ `processing`

#### 3. Defense-in-Depth Guard Trigger
The trigger `trg_guard_wardrobe_item_pipeline_transitions` runs `BEFORE UPDATE ON public.wardrobe_items`. It verifies `nullif(current_setting('app.pipeline_transition', true), '') IS NULL`. If direct (flag is null), any change to `processing_status` or `prettify_status` raises an immediate Postgres exception. When called through the trusted RPC, `set_config('app.pipeline_transition', 'true', true)` marks the transaction as authorized.

---

### C. Files Changed

1. [`supabase/migrations/0015_phase4b_gate2_security.sql`](file:///f:/project/autofashion/supabase/migrations/0015_phase4b_gate2_security.sql) — Consolidated Gate 2 database migration with RLS policies, draft provenance RPC, state transition RPCs, and defense-in-depth trigger.
2. [`supabase/migrations/0015_gate2_state_transition_guard.sql`](file:///f:/project/autofashion/supabase/migrations/0015_gate2_state_transition_guard.sql) — Superseded reference pointer.
3. [`scripts/seed_gate2_test_data.mjs`](file:///f:/project/autofashion/scripts/seed_gate2_test_data.mjs) — Deterministic, idempotent test fixture seeder with dynamic user discovery and curated catalog item initialization.
4. [`scripts/test_rls.mjs`](file:///f:/project/autofashion/scripts/test_rls.mjs) — Hardened security test suite with independent clients, zero hardcoded secrets, and full Gate 2 assertions.

---

### D. SQL Changes

Detailed breakdown in [`0015_phase4b_gate2_security.sql`](file:///f:/project/autofashion/supabase/migrations/0015_phase4b_gate2_security.sql):
- **`source_photos` Policies**: Explicit `owner select`, `owner insert`, `owner update`, `owner delete`.
- **`wardrobe_items` Policies**: Replaces global select with `select curated or own`.
- **`create_draft_wardrobe_item` RPC**:
  - Validates `auth.uid() IS NOT NULL`.
  - Enforces `source_photos.user_id = auth.uid()` when `p_source_photo_id` is supplied.
  - Inserts item and join atomically.
- **`transition_wardrobe_item_processing_state` RPC**:
  - `SECURITY DEFINER`, `search_path = public, pg_temp`.
  - Row locking (`FOR UPDATE`), ownership verification, authoritative transition mapping.
- **`transition_wardrobe_item_prettify_state` RPC**:
  - `SECURITY DEFINER`, `search_path = public, pg_temp`.
  - Prettify state machine verification independent of item lifecycle.
- **`guard_wardrobe_item_pipeline_transitions` Trigger**:
  - Checks `app.pipeline_transition` setting to block client PostgREST updates while allowing trusted RPC execution.

---

### E. Test Matrix & Validation Results

Executed via `scripts/test_rls.mjs` against dual client instances (`clientA` and `clientB`):

| Test ID | Test Description | Expected | Actual | Result |
| :--- | :--- | :--- | :--- | :--- |
| **A1** | User A SELECT own `source_photos` | 1 row returned | 1 row | **PASS** |
| **A2** | User B SELECT own `source_photos` | 1 row returned | 1 row | **PASS** |
| **A3** | User A SELECT User B's `source_photo` | 0 rows (DENIED) | 0 rows | **PASS** |
| **A4** | User B SELECT User A's `source_photo` | 0 rows (DENIED) | 0 rows | **PASS** |
| **A5** | User A unfiltered SELECT leaks no foreign rows | 0 foreign rows | 0 leaked | **PASS** |
| **A6** | User B unfiltered SELECT leaks no foreign rows | 0 foreign rows | 0 leaked | **PASS** |
| **A7** | User A UPDATE own `source_photo` | 1 row updated (ALLOW) | 1 row | **PASS** |
| **A8** | User B UPDATE own `source_photo` | 1 row updated (ALLOW) | 1 row | **PASS** |
| **A9** | User A UPDATE User B `source_photo` | 0 rows / blocked (DENY) | 0 rows | **PASS** |
| **A10** | User B UPDATE User A `source_photo` | 0 rows / blocked (DENY) | 0 rows | **PASS** |
| **A11** | User A DELETE User B `source_photo` | 0 rows / blocked (DENY) | 0 rows | **PASS** |
| **A12** | User B DELETE User A `source_photo` | 0 rows / blocked (DENY) | 0 rows | **PASS** |
| **B1** | User A reads own upload item | 1 row returned (ALLOW) | 1 row | **PASS** |
| **B2** | User B reads own upload item | 1 row returned (ALLOW) | 1 row | **PASS** |
| **B3** | User A reads User B upload item | 0 rows (DENY) | 0 rows | **PASS** |
| **B4** | User B reads User A upload item | 0 rows (DENY) | 0 rows | **PASS** |
| **B5** | User A unfiltered SELECT leaks no foreign uploads | 0 foreign uploads | 0 leaked | **PASS** |
| **B6** | User B unfiltered SELECT leaks no foreign uploads | 0 foreign uploads | 0 leaked | **PASS** |
| **B7** | User A mutates User B upload item | 0 rows / blocked (DENY) | 0 rows | **PASS** |
| **B8** | User B mutates User A upload item | 0 rows / blocked (DENY) | 0 rows | **PASS** |
| **B9** | User A reads curated catalog item | 1 row returned (ALLOW) | 1 row | **PASS** |
| **B10** | User B reads curated catalog item | 1 row returned (ALLOW) | 1 row | **PASS** |
| **B11** | Authenticated user cannot mutate curated item | 0 rows / blocked (DENY) | 0 rows | **PASS** |
| **C1** | User A direct UPDATE `processing_status` | Exception raised (DENY) | Blocked by trigger | **PASS** |
| **C2** | User A direct UPDATE `prettify_status` | Exception raised (DENY) | Blocked by trigger | **PASS** |
| **D1** | Transition `detected` $\rightarrow$ `isolating` | `isolating` (SUCCESS) | `isolating` | **PASS** |
| **D2** | Transition `isolating` $\rightarrow$ `isolated` | `isolated` (SUCCESS) | `isolated` | **PASS** |
| **D3** | Transition `isolated` $\rightarrow$ `extracting` | `extracting` (SUCCESS) | `extracting` | **PASS** |
| **D4** | Transition `extracting` $\rightarrow$ `extracted` | `extracted` (SUCCESS) | `extracted` | **PASS** |
| **D5** | Prettify `none` $\rightarrow$ `processing` | `processing` (SUCCESS) | `processing` | **PASS** |
| **D6** | Prettify `processing` $\rightarrow$ `done` | `done` (SUCCESS) | `done` | **PASS** |
| **E1** | Invalid transition `extracted` $\rightarrow$ `detected` | Exception & DB unchanged | Blocked; DB: `extracted` | **PASS** |
| **E2** | Invalid transition `extracted` $\rightarrow$ `isolating` | Exception & DB unchanged | Blocked; DB: `extracted` | **PASS** |
| **E3** | Invalid prettify `done` $\rightarrow$ `processing` | Exception & DB unchanged | Blocked; DB: `done` | **PASS** |
| **F1** | User B transition User A item (`processing`) | Exception & DB unchanged | Blocked; DB: `extracted` | **PASS** |
| **F2** | User B transition User A item (`prettify`) | Exception & DB unchanged | Blocked; DB: `done` | **PASS** |
| **G1** | User A creates derived item with own photo | Item UUID returned | Created item UUID | **PASS** |
| **G2** | Verify derived item provenance linkage | `source_photo_id` matches User A | Linked properly | **PASS** |
| **G3** | User A links User B photo (Provenance Spoof) | Exception / mismatch (DENY) | Blocked with exception | **PASS** |
| **H1** | Transition non-existent item UUID | Exception (DENIED) | Blocked | **PASS** |
| **H2** | Unauthenticated caller calls transition RPC | Exception (DENIED) | Blocked | **PASS** |
| **H3** | Draft creation with non-existent photo UUID | Exception (DENIED) | Blocked | **PASS** |

---

### F. Security Findings Report

```text
Finding 1: Hardcoded Test Credentials in scripts/test_rls.mjs
Severity: MAJOR (Remediated)
Affected Object: scripts/test_rls.mjs
Attack Scenario: Committed credentials could allow unauthorized access to test environments.
Current Protection: Environment variables (RLS_TEST_USER_A_EMAIL, etc.) and gitignore enforcement.
Fix: Refactored scripts/test_rls.mjs to read from process.env / .env.local; removed hardcoded secrets.
Test Proving Fix: Execution with dynamic env variables verified.

Finding 2: Global Catalog SELECT Leaked User Uploads
Severity: MAJOR (Remediated)
Affected Object: public.wardrobe_items RLS Policy
Attack Scenario: Any authenticated user could query wardrobe_items and inspect other users' private uploads.
Current Protection: Policy wardrobe_items: select curated or own restricts user_upload rows to owner.
Fix: Migration 0015 drops open SELECT policy and binds user_upload access to user_wardrobe_items.
Test Proving Fix: Tests B3, B4, B5, B6 prove zero rows leaked in direct or unfiltered queries.

Finding 3: Direct Pipeline State Tampering
Severity: BLOCKER (Remediated)
Affected Object: public.wardrobe_items (processing_status, prettify_status)
Attack Scenario: Malicious client could skip AI isolation/extraction stages by directly updating status columns.
Current Protection: trg_guard_wardrobe_item_pipeline_transitions trigger + transition RPCs.
Fix: State mutations require SECURITY DEFINER RPC setting app.pipeline_transition context.
Test Proving Fix: Tests C1 and C2 prove direct client updates are rejected with Postgres exceptions.
```

---

### G. Gate Recommendation

**Recommendation:** **PASS**

All Gate 2 criteria (Gate 2A: RLS & Ownership, Gate 2B: State Mutation Authorization) have been designed, coded, and verified.
