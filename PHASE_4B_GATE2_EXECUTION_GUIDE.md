# Phase 4B Gate 2 Execution Guide — Ready to Run

**Status:** 🟡 Ready for Execution  
**Date:** 2026-08-30  
**Tech Lead:** Phase 4B Backend  

---

## Executive Summary

You've approved Gate 1 ✅. Gate 2 is now fully prepared with:

1. ✅ **Migration complete** — 0014_phase4b_source_photo_pipeline.sql includes all Gate 1 conditions
2. ✅ **Test suite extended** — scripts/test_rls.mjs has Groups 4-6 (Phase 4B tests)
3. ✅ **Test plan documented** — PHASE_4B_GATE2_TEST_PLAN.md with full execution guide
4. ✅ **Gate 3 prepared** — PHASE_4B_GATE3_ENTRANCE_CRITERIA.md ready for next phase

**Next step:** Seed test data and run the RLS test suite.

---

## Quick Start (15 minutes)

### 1. Ensure Migration is Applied

Confirm the migration has run on your Supabase project:

```sql
-- In Supabase Dashboard → SQL Editor, run:
select table_name 
from information_schema.tables 
where table_schema = 'public' and table_name = 'source_photos';
```

Expected: One row with `source_photos` table name.

**If missing:** Apply the migration via dashboard or migration runner.

### 2. Create Test Accounts (If Needed)

In Supabase Dashboard → Authentication → Users:
- Create User A: `user-a@example.com` / `test-password-a` (any password)
- Create User B: `user-b@example.com` / `test-password-b`

Note their **UUIDs** (displayed in the dashboard).

### 3. Get User IDs for Seeding

```sql
-- Supabase Dashboard → SQL Editor
select id, email 
from auth.users 
where email in ('user-a@example.com', 'user-b@example.com');
```

Copy the UUIDs. You'll need them in step 4.

### 4. Seed Test Data

```sql
-- Supabase Dashboard → SQL Editor
-- Replace USER_A_UUID and USER_B_UUID with actual values from step 3

insert into public.source_photos (user_id, image_url, status, idempotency_key, file_hash)
values 
  ('USER_A_UUID', 'https://example.com/photo-a.jpg', 'done', 'test-a-001', 'hash-a-001'),
  ('USER_B_UUID', 'https://example.com/photo-b.jpg', 'done', 'test-b-001', 'hash-b-001');
```

Verify:
```sql
select user_id, image_url, status 
from public.source_photos 
order by created_at desc;
```

Expected: Two rows, one for each user.

### 5. Configure Test Environment

Create or update `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

(Copy from Supabase Dashboard → Settings → API)

### 6. Update Test Credentials

Edit `scripts/test_rls.mjs`:

```javascript
const USER_A_EMAIL    = 'user-a@example.com';
const USER_A_PASSWORD = 'test-password-a';    // What you set in Supabase
const USER_B_EMAIL    = 'user-b@example.com';
const USER_B_PASSWORD = 'test-password-b';
```

### 7. Run Tests

```bash
cd f:\project\autofashion
npm install  # If not already done
node scripts/test_rls.mjs
```

Expected output:
```
╔════════════════════════════════════════════════════════════════╗
║         GATE 2: Phase 4B RLS & Ownership Isolation Tests       ║
╚════════════════════════════════════════════════════════════════╝

--- Group 4: source_photos ownership isolation ---

PASS [User A can read their own source_photos] rows returned: 1 (expected >0)
PASS [User B cannot read User A's source_photos by ID] rows returned: 0 (expected 0)
PASS [User B cannot UPDATE User A's source_photos] blocked: ...
...

══════════════════════════════════════════════════════════════════
✅ All RLS tests PASSED.
══════════════════════════════════════════════════════════════════
```

---

## What Gets Tested

### Group 4: source_photos Ownership Isolation ✅

| Test | User A | User B |
|------|--------|--------|
| SELECT own | ✅ Rows | ✅ Rows |
| SELECT other's | ❌ 0 rows | ❌ 0 rows |
| UPDATE own | Blocked (policy) | Blocked (policy) |
| UPDATE other's | ❌ 0 rows | ❌ 0 rows |
| DELETE own | Blocked (policy) | Blocked (policy) |
| DELETE other's | ❌ 0 rows | ❌ 0 rows |

**Pass Criteria:** Cross-user operations return 0 rows or error.

### Group 5: wardrobe_items Link Isolation ✅

Tests that items linked to cross-user source_photos are properly isolated via foreign key + RLS.

**Pass Criteria:** No data leak via source_photo_id joins.

### Group 6: State Transition Ownership ✅

| Column | Client Update | Result |
|--------|---|---|
| `processing_status` | Direct UPDATE | ❌ Denied |
| `prettify_status` | Direct UPDATE | ❌ Denied |

**Pass Criteria:** Authenticated users cannot transition pipeline states (backend RPC only).

---

## Test Results Interpretation

### ✅ All Tests Pass

**Meaning:** Phase 4B schema and RLS policies are correctly implemented.

**Next Step:** Proceed to Gate 3 (Contracts & Mocks).

### ❌ Some Tests Fail

**Common Issues:**

1. **"relation 'source_photos' does not exist"**
   - Migration hasn't been applied
   - Fix: Run migration via dashboard

2. **"User B can see User A's source_photos"**
   - RLS policy is missing or incorrect
   - Fix: Verify policy in dashboard → SQL Editor:
     ```sql
     select * from pg_policies where tablename = 'source_photos';
     ```

3. **"All group 4 tests skipped"**
   - No source_photos in database
   - Fix: Re-run seeding SQL from step 4 above

4. **Test hangs on sign-in**
   - Invalid credentials or network issue
   - Fix: Verify NEXT_PUBLIC_SUPABASE_URL and user credentials

**For detailed troubleshooting:** See [PHASE_4B_GATE2_TEST_PLAN.md](PHASE_4B_GATE2_TEST_PLAN.md#failure-diagnosis).

---

## Gate 2 Deliverables Checklist

- [x] Migration 0014 applied with all Gate 1 conditions
- [x] Test suite extended (Groups 4-6)
- [x] Test plan documented
- [x] Environment setup guide provided
- [ ] Test data seeded (do this manually)
- [ ] Tests executed and passing (do this manually)
- [ ] Gate 2 sign-off (Tech Lead review after tests pass)

---

## Files Modified / Created

### Modified
- **scripts/test_rls.mjs** — Added Groups 4-6 (Phase 4B tests)

### Created
- **PHASE_4B_GATE2_TEST_PLAN.md** — Comprehensive test guide with matrix, prerequisites, execution steps, troubleshooting
- **PHASE_4B_GATE3_ENTRANCE_CRITERIA.md** — Detailed prep for Gate 3 (Contracts, RPCs, Mocks)
- **PHASE_4B_GATE2_EXECUTION_GUIDE.md** (this file) — Quick-start guide

---

## Timeline

- **Now:** Seed test data (5 min)
- **5 min:** Update test credentials in test_rls.mjs (2 min)
- **7 min:** Run tests (2-3 min)
- **10 min:** Interpret results (2-5 min)

**Total:** ~15 minutes to completion.

---

## Success Criteria

Gate 2 **PASSES** when:

✅ All A→A tests pass (users can access their own data)  
✅ All A→B tests fail (users cannot access others' data)  
✅ All B→B tests pass  
✅ All B→A tests fail  
✅ No data leaks in cross-user queries  
✅ State transitions blocked for clients  

Gate 2 **FAILS** if:

❌ Cross-user data is accessible  
❌ RLS policies are missing or misconfigured  
❌ State transitions can be directly updated by authenticated users  

---

## After Gate 2: Gate 3 Preparation

Once tests pass, Gate 3 is ready. See [PHASE_4B_GATE3_ENTRANCE_CRITERIA.md](PHASE_4B_GATE3_ENTRANCE_CRITERIA.md) for:

- TypeScript contracts (CropBox, ProcessingStatus, etc.)
- SECURITY_DEFINER RPC layer (create_draft_wardrobe_item, state transitions)
- Mock AI providers
- Orchestrator skeleton

**Estimated duration:** 2 days for Gate 3.

---

## Support

If tests fail:

1. **Read error message carefully** — it will tell you what's wrong
2. **Check [Failure Diagnosis](PHASE_4B_GATE2_TEST_PLAN.md#failure-diagnosis)** section
3. **Verify prerequisites:**
   - Migration applied?
   - Test accounts created?
   - Test data seeded?
   - Environment variables set?
4. **Run individual SQL queries** to debug RLS policies

---

## Key Documents

- [PHASE_4B_GATE1_REVIEW.md](PHASE_4B_GATE1_REVIEW.md) — Gate 1 conditions & sign-off
- [PHASE_4B_GATE2_TEST_PLAN.md](PHASE_4B_GATE2_TEST_PLAN.md) — Complete Gate 2 guide
- [PHASE_4B_GATE3_ENTRANCE_CRITERIA.md](PHASE_4B_GATE3_ENTRANCE_CRITERIA.md) — Gate 3 prep
- [supabase/migrations/0014_phase4b_source_photo_pipeline.sql](supabase/migrations/0014_phase4b_source_photo_pipeline.sql) — Schema
- [scripts/test_rls.mjs](scripts/test_rls.mjs) — Test suite

---

**Ready to run? Start with section "Quick Start" above.** ✅
