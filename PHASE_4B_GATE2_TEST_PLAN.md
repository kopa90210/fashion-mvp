# Gate 2: RLS & Ownership Tests — Test Plan & Execution Guide

**Status:** 🟡 Ready for Execution  
**Objective:** Prove the complete ownership graph is isolated via automated RLS tests  
**Test Date:** TBD (after test data seeding)

---

## Overview

Gate 2 validates that the Phase 4B source photo pipeline respects user ownership boundaries at the database level. The schema (from Gate 1) defines the structure; Gate 2 proves the RLS policies enforce it.

### Test Matrix

#### 1. source_photos Ownership Isolation

| User | Operation | Target | Expected |
|------|-----------|--------|----------|
| A | SELECT | A's photo | ✅ Rows returned |
| A | SELECT | B's photo | ❌ Zero rows (RLS blocks) |
| A | UPDATE | A's photo | ✅/❌ Depends on policy |
| A | UPDATE | B's photo | ❌ Zero rows affected |
| A | DELETE | A's photo | ✅/❌ Depends on policy |
| A | DELETE | B's photo | ❌ Zero rows affected |
| B | SELECT | B's photo | ✅ Rows returned |
| B | SELECT | A's photo | ❌ Zero rows (RLS blocks) |
| B | UPDATE | B's photo | ✅/❌ Depends on policy |
| B | UPDATE | A's photo | ❌ Zero rows affected |
| B | DELETE | B's photo | ✅/❌ Depends on policy |
| B | DELETE | A's photo | ❌ Zero rows affected |

#### 2. wardrobe_items Linked via source_photo_id

| User | Operation | Item Owner | Source Owner | Expected |
|------|-----------|------------|--------------|----------|
| A | SELECT | A | A | ✅ Rows returned |
| A | SELECT | A | B | ❌ Zero rows (isolation) |
| A | UPDATE processing_status | A | A | ❌ Blocked by policy |
| A | UPDATE processing_status | A | B | ❌ Blocked by policy + ownership |
| B | SELECT | B | B | ✅ Rows returned |
| B | SELECT | B | A | ❌ Zero rows (isolation) |
| B | UPDATE processing_status | B | B | ❌ Blocked by policy |
| B | UPDATE processing_status | B | A | ❌ Blocked by policy + ownership |

#### 3. State Transition Ownership

| State Column | Client Update | Expected |
|-------------|---|---|
| `processing_status` | Direct UPDATE | ❌ Denied (backend RPC only) |
| `prettify_status` | Direct UPDATE | ❌ Denied (backend RPC only) |
| `source_photo_id` | INSERT | ✅ Allowed (must match auth.uid()) |

---

## Test Execution Procedure

### Prerequisites

1. **Two real Supabase accounts**
   ```
   User A: user-a@example.com
   User B: user-b@example.com
   ```
   - Create these in the Supabase dashboard under Authentication → Users

2. **Environment configured**
   ```bash
   export NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co"
   export NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGc..."
   ```

3. **Migration applied**
   - Confirm `0014_phase4b_source_photo_pipeline.sql` has been run
   - Check: `source_photos` table exists in public schema
   - Check: RLS enabled on `source_photos`

4. **Test data seeded**
   - User A must have at least 1 `source_photo` row
   - User B must have at least 1 `source_photo` row
   - User A must have at least 1 `wardrobe_items` row linked to their source_photo

### Seeding Test Data

#### Option 1: Manual via UI (Recommended for real-world validation)
1. Sign in as User A in the web app
2. Upload a source photo (new Phase 4B feature)
3. Repeat for User B
4. Confirm photos appear in Supabase dashboard

#### Option 2: SQL Script (Quick setup for testing)
```sql
-- Run as service_role (via Supabase dashboard SQL editor)

-- Seed User A's source_photo
insert into public.source_photos (user_id, image_url, status, idempotency_key, file_hash)
values (
  'USER-A-UUID-HERE',
  'https://example.com/photo-a.jpg',
  'done',
  'upload-key-a-001',
  'hash-a-001'
);

-- Seed User B's source_photo
insert into public.source_photos (user_id, image_url, status, idempotency_key, file_hash)
values (
  'USER-B-UUID-HERE',
  'https://example.com/photo-b.jpg',
  'done',
  'upload-key-b-001',
  'hash-b-001'
);
```

To get User IDs:
```sql
select id, email from auth.users where email in ('user-a@example.com', 'user-b@example.com');
```

### Running Tests

```bash
# From project root
cd f:\project\autofashion

# Ensure dependencies installed
npm install

# Run the full RLS test suite
node scripts/test_rls.mjs
```

### Expected Output

Successful run:
```
--- Signing in as User A ---
User A id: 12345...

✓ [User A reads own fashion_dna] rows returned: 1 (expected >0)
PASS [User B cannot read User A's fashion_dna] rows returned: 0 (expected 0)

... (Phase 3 tests) ...

╔════════════════════════════════════════════════════════════════╗
║         GATE 2: Phase 4B RLS & Ownership Isolation Tests       ║
╚════════════════════════════════════════════════════════════════╝

--- Group 4: source_photos ownership isolation ---

✓ Signed in as User A
✓ [User A has source_photos] found 1 photo(s), testing with ID: photo-uuid-123

PASS [User A can read their own source_photos] rows returned: 1 (expected >0)
INFO [User A can/cannot UPDATE own source_photos] PASS (policy blocks writes as expected)

✓ Signing in as User B...
✓ Signed in as User B

PASS [User B cannot read User A's source_photos by ID] rows returned: 0 (expected 0)
PASS [User B unfiltered SELECT leaks no User-A source_photos] leaked: 0 (expected 0)
PASS [User B cannot UPDATE User A's source_photos] blocked: ...
PASS [User B cannot DELETE User A's source_photos] blocked: ...

... (Groups 5-6 tests) ...

══════════════════════════════════════════════════════════════════
✅ All RLS tests PASSED.
══════════════════════════════════════════════════════════════════
```

---

## Test Groups Detail

### Group 4: source_photos Ownership Isolation

**Goal:** Confirm `source_photos` RLS policy enforces per-user access.

Tests:
- 4a: User A SELECT own source_photos (own ID)
- 4b: User A UPDATE own source_photos
- 4c: User A DELETE own source_photos
- 4d: User B SELECT User A's source_photos (cross-user) → expect 0 rows
- 4e: User B SELECT * (unfiltered) → RLS strips User A rows
- 4f: User B UPDATE User A's source_photos → expect 0 rows affected
- 4g: User B DELETE User A's source_photos → expect 0 rows affected

**Pass Criteria:** All cross-user operations return 0 rows or error.

### Group 5: wardrobe_items Linked via source_photo_id

**Goal:** Prove that items linked to cross-user source_photos are isolated.

Tests:
- 5a: User B tries to read wardrobe_items linked to User A's source_photo
  - Expected: Either 0 rows (RLS enforces isolation) or informational (Gate 3 will add enforcement)

**Pass Criteria:** No data leak; isolation is maintained or documented as future work.

### Group 6: State Transition Ownership (Backend RPC Only)

**Goal:** Confirm that `processing_status` and `prettify_status` cannot be directly updated by authenticated clients.

Tests:
- 6a: User A tries direct UPDATE on `processing_status` (own item)
  - Expected: ❌ Blocked (backend RPC only)
- 6b: User A tries direct UPDATE on `prettify_status` (own item)
  - Expected: ❌ Blocked (backend RPC only)
- 6c: User B tries direct UPDATE on `processing_status` (User A's item)
  - Expected: ❌ Blocked (ownership + policy)

**Pass Criteria:** All direct UPDATE attempts are blocked.

---

## Failure Diagnosis

### Symptom: "Error: relation 'source_photos' does not exist"
**Cause:** Migration 0014 has not been applied.  
**Fix:** Run the migration via Supabase dashboard → SQL Editor, or via MigrationRunner.

### Symptom: User B can see User A's source_photos
**Cause:** RLS policy is missing or incorrect.  
**Fix:** 
```sql
-- Verify policy exists
select * from pg_policies where tablename = 'source_photos';

-- Rebuild if needed
drop policy if exists "source_photos: owner all" on public.source_photos;
create policy "source_photos: owner all"
  on public.source_photos for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

### Symptom: Tests hang on "Signing in as User..."
**Cause:** Network issue or invalid credentials.  
**Fix:**
- Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set
- Confirm User A and User B emails are correct in test_rls.mjs
- Check that both users have confirmed email in Supabase

### Symptom: "All group 5 tests skipped: source_photos not populated"
**Cause:** No test data seeded.  
**Fix:** Follow "Seeding Test Data" section above.

---

## Gate 2 Checklist

- [ ] Migration 0014 is applied
- [ ] `source_photos` table exists with correct schema
- [ ] `source_photos` RLS policy "owner all" is in place
- [ ] Two real Supabase accounts created (user-a@, user-b@)
- [ ] Test data seeded (each user has ≥1 source_photo)
- [ ] Environment variables configured (NEXT_PUBLIC_SUPABASE_*)
- [ ] `npm install` completed
- [ ] Test suite runs: `node scripts/test_rls.mjs`
- [ ] All Groups 4-6 tests PASS
- [ ] No data leaks detected (cross-user tests return 0 rows)
- [ ] State transition blocks confirmed (direct UPDATE → denied)

---

## Gate 2 Sign-Off Criteria

**PASS** when:
1. All A→A tests return expected rows/errors (access allowed)
2. All A→B tests return zero rows or error (access denied)
3. All B→B tests return expected rows/errors (access allowed)
4. All B→A tests return zero rows or error (access denied)
5. State transitions cannot be directly updated by clients
6. No unintended data leaks to cross-user queries

**FAIL** if:
- Any cross-user isolation test returns accessible data
- State transition columns can be updated by authenticated users
- RLS policies are missing or misconfigured
- Test data cannot be seeded

---

## Next: Gate 3 Entrance Criteria

Once Gate 2 passes, prepare for Gate 3 (Contracts & Mocks):

1. Define `CropBox` TypeScript type with validation
2. Create contract interfaces for extraction orchestrator
3. Implement `create_draft_wardrobe_item` RPC (SECURITY_DEFINER)
4. Mock AI provider responses for testing
5. Implement extraction retries and error handling

---

## Appendix: Manual Test Query Examples

Run these in Supabase dashboard SQL Editor to verify RLS behavior:

### As User A (authenticated session):
```sql
-- Should return User A's photos
select id, user_id, status from public.source_photos;
```

### Switch to User B session, then:
```sql
-- Should return ZERO rows (RLS blocks User A's photos)
select id, user_id, status from public.source_photos;
```

### As service_role (backend, no RLS):
```sql
-- Returns ALL photos (no RLS applied)
set role service_role;
select id, user_id, status from public.source_photos;
```

---

## References

- Gate 1 Review: [PHASE_4B_GATE1_REVIEW.md](PHASE_4B_GATE1_REVIEW.md)
- Migration: [supabase/migrations/0014_phase4b_source_photo_pipeline.sql](supabase/migrations/0014_phase4b_source_photo_pipeline.sql)
- Test Suite: [scripts/test_rls.mjs](scripts/test_rls.mjs)
