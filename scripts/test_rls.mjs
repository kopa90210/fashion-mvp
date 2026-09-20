/**
 * scripts/test_rls.mjs
 * Phase 4B Gate 2B: RLS & Backend-Only State Mutation Authorization Test Suite
 *
 * Verifies:
 *   - Group A: source_photos ownership isolation & field mutability protection
 *   - Group B: wardrobe_items privacy & direct INSERT denial for authenticated clients
 *   - Group C: Direct pipeline state mutation denial (direct client updates to processing/prettify status forbidden)
 *   - Group D: Client denial on internal transition RPCs (both legacy 2-param and new 3-param)
 *   - Group E: Backend service-role authorized state transitions (positive path)
 *   - Group F: Invalid state transitions rejection & state immutability on failure
 *   - Group G: Cross-user transition attempts rejection by backend RPC & state immutability
 *   - Group H: Source photo -> wardrobe item provenance invariant enforcement
 *   - Group I: Concurrency serialization & row locking
 *   - Group J: Failure and edge cases (unauthenticated, unknown items/photos, etc.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Load environment variables safely
function loadEnv() {
  const envFiles = ['.env.local', '.env'];
  for (const file of envFiles) {
    const fullPath = path.resolve(process.cwd(), file);
    if (fs.existsSync(fullPath)) {
      const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const [key, ...rest] = trimmed.split('=');
        const val = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
        if (!process.env[key.trim()]) {
          process.env[key.trim()] = val;
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const USER_A_EMAIL = process.env.RLS_TEST_USER_A_EMAIL;
const USER_A_PASSWORD = process.env.RLS_TEST_USER_A_PASSWORD;
const USER_B_EMAIL = process.env.RLS_TEST_USER_B_EMAIL;
const USER_B_PASSWORD = process.env.RLS_TEST_USER_B_PASSWORD;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('❌ Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_ANON_KEY in environment.');
  process.exit(1);
}

if (!USER_A_EMAIL || !USER_A_PASSWORD || !USER_B_EMAIL || !USER_B_PASSWORD) {
  console.error('❌ Missing test user credentials in environment (RLS_TEST_USER_A_EMAIL, RLS_TEST_USER_A_PASSWORD, RLS_TEST_USER_B_EMAIL, RLS_TEST_USER_B_PASSWORD).');
  console.error('   Please define them in .env.local or process environment.');
  process.exit(1);
}

if (!SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_SERVICE_KEY in environment (required for backend orchestrator tests).');
  process.exit(1);
}

// ── Instantiate Separate Supabase Clients ─────────────────────────────────────
const clientA = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const clientB = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Test Reporting Infrastructure ─────────────────────────────────────────────
const testResults = [];
let allPassed = true;

function recordResult(group, testName, expected, actual, pass, details = '') {
  const result = pass ? 'PASS' : 'FAIL';
  testResults.push({ group, testName, expected, actual, result, details });
  if (!pass) allPassed = false;
  const icon = pass ? '✅ PASS' : '❌ FAIL';
  console.log(`${icon} [${group}] ${testName} | Expected: ${expected} | Actual: ${actual}${details ? ' | ' + details : ''}`);
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════╗');
  console.log('║        PHASE 4B — GATE 2B SECURITY & STATE MUTATION TEST SUITE           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════╝\n');

  // Authenticate Client A
  console.log('Authenticating Client A...');
  const { data: authA, error: authAErr } = await clientA.auth.signInWithPassword({
    email: USER_A_EMAIL,
    password: USER_A_PASSWORD,
  });
  if (authAErr || !authA?.user) {
    console.error('❌ Failed to authenticate User A:', authAErr?.message);
    process.exit(1);
  }
  const userAId = authA.user.id;
  console.log(`✓ Authenticated User A: ${userAId}`);

  // Authenticate Client B
  console.log('Authenticating Client B...');
  const { data: authB, error: authBErr } = await clientB.auth.signInWithPassword({
    email: USER_B_EMAIL,
    password: USER_B_PASSWORD,
  });
  if (authBErr || !authB?.user) {
    console.error('❌ Failed to authenticate User B:', authBErr?.message);
    process.exit(1);
  }
  const userBId = authB.user.id;
  console.log(`✓ Authenticated User B: ${userBId}\n`);

  // Fetch Test Fixtures for User A (Filter specifically for active seeded items)
  const { data: userAPhotos } = await clientA
    .from('source_photos')
    .select('id, user_id')
    .ilike('idempotency_key', 'gate2-test-a-%')
    .order('created_at', { ascending: false })
    .limit(1);

  const { data: userAItems } = await clientA
    .from('user_wardrobe_items')
    .select('item_id, wardrobe_items(id, source, processing_status, prettify_status, source_photo_id, display_name)')
    .eq('user_id', userAId)
    .order('added_at', { ascending: false });

  // Fetch Test Fixtures for User B
  const { data: userBPhotos } = await clientB
    .from('source_photos')
    .select('id, user_id')
    .ilike('idempotency_key', 'gate2-test-b-%')
    .order('created_at', { ascending: false })
    .limit(1);

  const { data: userBItems } = await clientB
    .from('user_wardrobe_items')
    .select('item_id, wardrobe_items(id, source, processing_status, prettify_status, source_photo_id, display_name)')
    .eq('user_id', userBId)
    .order('added_at', { ascending: false });

  // Curated Item
  const { data: curatedList } = await clientA
    .from('wardrobe_items')
    .select('id, source')
    .eq('source', 'curated')
    .limit(1);

  if (!userAPhotos?.length || !userAItems?.length || !userBPhotos?.length || !userBItems?.length || !curatedList?.length) {
    console.error('❌ Required test fixtures are missing. Run: node scripts/seed_gate2_test_data.mjs');
    process.exit(1);
  }

  const sourcePhotoAId = userAPhotos[0].id;
  // Match the seeded test item for User A
  const seededA = userAItems.find(i => i.wardrobe_items?.display_name === 'Gate2 Test Oxford Shirt A') || userAItems[0];
  const wardrobeItemAId = seededA.item_id;

  const sourcePhotoBId = userBPhotos[0].id;
  // Match the seeded test item for User B
  const seededB = userBItems.find(i => i.wardrobe_items?.display_name === 'Gate2 Test Dark Denim B') || userBItems[0];
  const wardrobeItemBId = seededB.item_id;

  const curatedItemId = curatedList[0].id;

  console.log('──────────────────────────────────────────────────────────────────────────');
  console.log('Test Fixtures Loaded:');
  console.log(`  User A Source Photo: ${sourcePhotoAId}`);
  console.log(`  User A Wardrobe Item: ${wardrobeItemAId}`);
  console.log(`  User B Source Photo: ${sourcePhotoBId}`);
  console.log(`  User B Wardrobe Item: ${wardrobeItemBId}`);
  console.log(`  Curated Catalog Item: ${curatedItemId}`);
  console.log('──────────────────────────────────────────────────────────────────────────\n');

  // =========================================================================
  // GROUP A: source_photos Ownership Isolation & Mutability Protection
  // =========================================================================
  console.log('--- GROUP A: source_photos Ownership Isolation & Mutability Protection ---');

  // A1: User A SELECT own source_photos
  {
    const { data, error } = await clientA.from('source_photos').select('id, user_id').eq('id', sourcePhotoAId);
    const pass = !error && data.length === 1 && data[0].id === sourcePhotoAId;
    recordResult('Group A', 'User A SELECT own source_photos', '1 row returned', `${data?.length ?? 0} rows`, pass);
  }

  // A2: User B SELECT own source_photos
  {
    const { data, error } = await clientB.from('source_photos').select('id, user_id').eq('id', sourcePhotoBId);
    const pass = !error && data.length === 1 && data[0].id === sourcePhotoBId;
    recordResult('Group A', 'User B SELECT own source_photos', '1 row returned', `${data?.length ?? 0} rows`, pass);
  }

  // A3: User A SELECT User B's source_photo by ID
  {
    const { data, error } = await clientA.from('source_photos').select('id, user_id').eq('id', sourcePhotoBId);
    const pass = !error && data.length === 0;
    recordResult('Group A', 'User A SELECT User B source_photo', '0 rows (DENIED)', `${data?.length ?? 0} rows`, pass);
  }

  // A4: User B SELECT User A's source_photo by ID
  {
    const { data, error } = await clientB.from('source_photos').select('id, user_id').eq('id', sourcePhotoAId);
    const pass = !error && data.length === 0;
    recordResult('Group A', 'User B SELECT User A source_photo', '0 rows (DENIED)', `${data?.length ?? 0} rows`, pass);
  }

  // A5: User A unfiltered SELECT leaks no foreign rows
  {
    const { data, error } = await clientA.from('source_photos').select('id, user_id');
    const leaked = (data ?? []).filter((r) => r.user_id !== userAId);
    const pass = !error && leaked.length === 0;
    recordResult('Group A', 'User A unfiltered SELECT leaks no foreign rows', '0 foreign rows', `${leaked.length} leaked`, pass);
  }

  // A6: Client A attempts direct UPDATE on source_photos (Protected field: status)
  {
    const { data, error } = await clientA
      .from('source_photos')
      .update({ status: 'done' })
      .eq('id', sourcePhotoAId)
      .select();
    const pass = error != null || (data && data.length === 0);
    recordResult('Group A', 'Client direct UPDATE source_photos status', 'Blocked / 0 rows (DENY)', error ? error.message : `${data?.length ?? 0} rows`, pass);
  }

  // A7: Client A attempts direct UPDATE on source_photos (Protected field: user_id ownership tampering)
  {
    const { data, error } = await clientA
      .from('source_photos')
      .update({ user_id: userBId })
      .eq('id', sourcePhotoAId)
      .select();
    const pass = error != null || (data && data.length === 0);
    recordResult('Group A', 'Client direct UPDATE source_photos user_id', 'Blocked / 0 rows (DENY)', error ? error.message : `${data?.length ?? 0} rows`, pass);
  }

  // A8: User A DELETE User B source_photo
  {
    const { data, error } = await clientA
      .from('source_photos')
      .delete()
      .eq('id', sourcePhotoBId)
      .select();
    const pass = error != null || (data && data.length === 0);
    recordResult('Group A', 'User A DELETE User B source_photo', '0 rows / blocked (DENY)', error ? error.message : `${data?.length ?? 0} rows`, pass);
  }

  // =========================================================================
  // GROUP B: wardrobe_items Privacy & Direct INSERT Denial
  // =========================================================================
  console.log('\n--- GROUP B: wardrobe_items Privacy & Direct INSERT Denial ---');

  // B1: User A reads own upload item
  {
    const { data, error } = await clientA.from('wardrobe_items').select('id, source').eq('id', wardrobeItemAId);
    const pass = !error && data.length === 1;
    recordResult('Group B', 'User A reads own upload item', '1 row returned (ALLOW)', `${data?.length ?? 0} rows`, pass);
  }

  // B2: User A reads User B upload item (Must be DENIED)
  {
    const { data, error } = await clientA.from('wardrobe_items').select('id, source').eq('id', wardrobeItemBId);
    const pass = !error && data.length === 0;
    recordResult('Group B', 'User A reads User B upload item', '0 rows (DENY)', `${data?.length ?? 0} rows`, pass);
  }

  // B3: Curated item readable by User A
  {
    const { data, error } = await clientA.from('wardrobe_items').select('id, source').eq('id', curatedItemId);
    const pass = !error && data.length === 1 && data[0].source === 'curated';
    recordResult('Group B', 'User A reads curated item', '1 row returned (ALLOW)', `${data?.length ?? 0} rows`, pass);
  }

  // B4: Authenticated client direct INSERT into wardrobe_items (Must be DENIED)
  {
    const { data, error } = await clientA
      .from('wardrobe_items')
      .insert({
        source: 'user_upload',
        image_url: 'https://example.com/exploit-direct-insert.jpg',
        status: 'confirmed',
      })
      .select();
    const pass = error != null;
    recordResult(
      'Group B',
      'Client direct INSERT into wardrobe_items',
      'Exception / Permission Denied (DENY)',
      error ? `Blocked: ${error.message}` : `Exploit allowed: ${data?.length} rows`,
      pass
    );
  }

  // B5: Authenticated client cannot mutate curated item
  {
    const { data, error } = await clientA
      .from('wardrobe_items')
      .update({ display_name: 'hacked curated item' })
      .eq('id', curatedItemId)
      .select();
    const pass = error != null || (data && data.length === 0);
    recordResult('Group B', 'Authenticated client mutate curated item', '0 rows / blocked (DENY)', error ? error.message : `${data?.length ?? 0} rows`, pass);
  }

  // =========================================================================
  // GROUP C: Direct Pipeline State Mutation Tests (Column & Trigger Protection)
  // =========================================================================
  console.log('\n--- GROUP C: Direct Pipeline State Mutation Tests ---');

  // C1: User A direct UPDATE processing_status on own item
  {
    const { data, error } = await clientA
      .from('wardrobe_items')
      .update({ processing_status: 'isolating' })
      .eq('id', wardrobeItemAId)
      .select();
    const pass = error != null;
    recordResult(
      'Group C',
      'Client direct UPDATE processing_status',
      'Exception / Trigger Blocked (DENY)',
      error ? `Blocked: ${error.message}` : `Allowed (${data?.length} rows)`,
      pass
    );
  }

  // C2: User A direct UPDATE prettify_status on own item
  {
    const { data, error } = await clientA
      .from('wardrobe_items')
      .update({ prettify_status: 'processing' })
      .eq('id', wardrobeItemAId)
      .select();
    const pass = error != null;
    recordResult(
      'Group C',
      'Client direct UPDATE prettify_status',
      'Exception / Trigger Blocked (DENY)',
      error ? `Blocked: ${error.message}` : `Allowed (${data?.length} rows)`,
      pass
    );
  }

  // =========================================================================
  // GROUP D: Client Invocation Denial on Internal Transition RPCs
  // =========================================================================
  console.log('\n--- GROUP D: Client Invocation Denial on Internal Transition RPCs ---');

  // D1: Client calls legacy 2-param transition_processing (Must fail: dropped / revoked)
  {
    const { error } = await clientA.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: wardrobeItemAId,
      p_target_status: 'isolating',
    });
    const pass = error != null;
    recordResult('Group D', 'Client calls legacy 2-param transition_processing', 'Exception / Not Found (DENY)', error ? error.message : 'Allowed', pass);
  }

  // D2: Client calls new 3-param transition_processing (Must fail: permission denied 42501)
  {
    const { error } = await clientA.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: wardrobeItemAId,
      p_target_status: 'isolating',
      p_user_id: userAId,
    });
    const pass = error != null;
    recordResult('Group D', 'Client calls 3-param transition_processing', 'Permission Denied (DENY)', error ? error.message : 'Allowed', pass);
  }

  // D3: Client calls legacy 2-param transition_prettify (Must fail: dropped / revoked)
  {
    const { error } = await clientA.rpc('transition_wardrobe_item_prettify_state', {
      p_item_id: wardrobeItemAId,
      p_target_status: 'processing',
    });
    const pass = error != null;
    recordResult('Group D', 'Client calls legacy 2-param transition_prettify', 'Exception / Not Found (DENY)', error ? error.message : 'Allowed', pass);
  }

  // D4: Client calls new 3-param transition_prettify (Must fail: permission denied 42501)
  {
    const { error } = await clientA.rpc('transition_wardrobe_item_prettify_state', {
      p_item_id: wardrobeItemAId,
      p_target_status: 'processing',
      p_user_id: userAId,
    });
    const pass = error != null;
    recordResult('Group D', 'Client calls 3-param transition_prettify', 'Permission Denied (DENY)', error ? error.message : 'Allowed', pass);
  }

  // =========================================================================
  // GROUP E: Backend Service-Role Authorized State Transitions
  // =========================================================================
  console.log('\n--- GROUP E: Backend Service-Role Authorized State Transitions ---');

  // Create a dedicated fresh draft item for Group E transitions via canonical provenance RPC
  const { data: freshTestItemId, error: freshItemErr } = await clientA.rpc('create_draft_wardrobe_item', {
    p_image_url: 'https://example.com/fresh-transition-test.jpg',
    p_source_photo_id: sourcePhotoAId,
  });
  if (freshItemErr || !freshTestItemId) {
    console.error('❌ Failed to create fresh draft item for Group E:', freshItemErr);
    process.exit(1);
  }

  // E1: Service-Role transition: detected -> isolating
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'isolating',
      p_user_id: userAId,
    });
    const pass = !error && data === 'isolating';
    recordResult('Group E', 'Service-Role transition detected -> isolating', 'isolating (SUCCESS)', error ? error.message : data, pass);
  }

  // E2: Service-Role transition: isolating -> isolated
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'isolated',
      p_user_id: userAId,
    });
    const pass = !error && data === 'isolated';
    recordResult('Group E', 'Service-Role transition isolating -> isolated', 'isolated (SUCCESS)', error ? error.message : data, pass);
  }

  // E3: Service-Role transition: isolated -> extracting
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'extracting',
      p_user_id: userAId,
    });
    const pass = !error && data === 'extracting';
    recordResult('Group E', 'Service-Role transition isolated -> extracting', 'extracting (SUCCESS)', error ? error.message : data, pass);
  }

  // E4: Service-Role transition: extracting -> extracted
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'extracted',
      p_user_id: userAId,
    });
    const pass = !error && data === 'extracted';
    recordResult('Group E', 'Service-Role transition extracting -> extracted', 'extracted (SUCCESS)', error ? error.message : data, pass);
  }

  // E5: Service-Role Prettify: none -> processing
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_prettify_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'processing',
      p_user_id: userAId,
    });
    const pass = !error && data === 'processing';
    recordResult('Group E', 'Service-Role prettify none -> processing', 'processing (SUCCESS)', error ? error.message : data, pass);
  }

  // E6: Service-Role Prettify: processing -> done
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_prettify_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'done',
      p_user_id: userAId,
    });
    const pass = !error && data === 'done';
    recordResult('Group E', 'Service-Role prettify processing -> done', 'done (SUCCESS)', error ? error.message : data, pass);
  }

  // =========================================================================
  // GROUP F: Invalid State Transitions & Immutability Check
  // =========================================================================
  console.log('\n--- GROUP F: Invalid State Transitions & Immutability Check ---');

  // F1: extracted -> detected (invalid backward jump)
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'detected',
      p_user_id: userAId,
    });
    const { data: dbRow } = await serviceClient.from('wardrobe_items').select('processing_status').eq('id', freshTestItemId).single();
    const pass = error != null && dbRow?.processing_status === 'extracted';
    recordResult(
      'Group F',
      'Invalid transition extracted -> detected',
      'Exception & state unchanged (DENIED)',
      error ? `Rejected: ${error.message} (DB state: ${dbRow?.processing_status})` : `Unexpected success: ${data}`,
      pass
    );
  }

  // F2: Prettify done -> processing (invalid transition from terminal done)
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_prettify_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'processing',
      p_user_id: userAId,
    });
    const { data: dbRow } = await serviceClient.from('wardrobe_items').select('prettify_status').eq('id', freshTestItemId).single();
    const pass = error != null && dbRow?.prettify_status === 'done';
    recordResult(
      'Group F',
      'Invalid prettify done -> processing',
      'Exception & state unchanged (DENIED)',
      error ? `Rejected: ${error.message} (DB state: ${dbRow?.prettify_status})` : `Unexpected success: ${data}`,
      pass
    );
  }

  // =========================================================================
  // GROUP G: Cross-User Ownership Enforcement in Backend RPC
  // =========================================================================
  console.log('\n--- GROUP G: Cross-User Ownership Enforcement in Backend RPC ---');

  // G1: Backend passes User B user_id for User A's item (processing)
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'failed',
      p_user_id: userBId,
    });
    const { data: dbRow } = await serviceClient.from('wardrobe_items').select('processing_status').eq('id', freshTestItemId).single();
    const pass = error != null && dbRow?.processing_status === 'extracted';
    recordResult(
      'Group G',
      'Cross-user transition attempt (processing)',
      'Exception & state unchanged (DENIED)',
      error ? `Blocked: ${error.message} (DB state: ${dbRow?.processing_status})` : `Unexpected success: ${data}`,
      pass
    );
  }

  // G2: Backend passes User B user_id for User A's item (prettify)
  {
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_prettify_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'failed',
      p_user_id: userBId,
    });
    const { data: dbRow } = await serviceClient.from('wardrobe_items').select('prettify_status').eq('id', freshTestItemId).single();
    const pass = error != null && dbRow?.prettify_status === 'done';
    recordResult(
      'Group G',
      'Cross-user transition attempt (prettify)',
      'Exception & state unchanged (DENIED)',
      error ? `Blocked: ${error.message} (DB state: ${dbRow?.prettify_status})` : `Unexpected success: ${data}`,
      pass
    );
  }

  // =========================================================================
  // GROUP H: Provenance Invariant Enforcement (create_draft_wardrobe_item)
  // =========================================================================
  console.log('\n--- GROUP H: Provenance Invariant Enforcement ---');

  // H1: User A creates draft item referencing owned source photo
  let userADerivedItemId = null;
  {
    const { data, error } = await clientA.rpc('create_draft_wardrobe_item', {
      p_image_url: 'https://example.com/user-a-provenance-test.jpg',
      p_source_photo_id: sourcePhotoAId,
    });
    userADerivedItemId = data;
    const pass = !error && userADerivedItemId != null;
    recordResult(
      'Group H',
      'User A creates item with owned source photo',
      'Item UUID returned (ALLOW)',
      error ? error.message : `Created item: ${userADerivedItemId}`,
      pass
    );
  }

  // H2: Verify provenance linkage and default states in database
  if (userADerivedItemId) {
    const { data, error } = await clientA
      .from('wardrobe_items')
      .select('id, source_photo_id, source, processing_status, prettify_status, status')
      .eq('id', userADerivedItemId)
      .single();
    const pass =
      !error &&
      data.source_photo_id === sourcePhotoAId &&
      data.source === 'user_upload' &&
      data.status === 'draft' &&
      data.processing_status === 'detected' &&
      data.prettify_status === 'none';
    recordResult(
      'Group H',
      'Verify derived item provenance & default state',
      'source_photo_id linked, status=draft, processing=detected, prettify=none',
      error ? error.message : `Linked: ${data?.source_photo_id}, processing: ${data?.processing_status}`,
      pass
    );
  }

  // H3: User A attempts to create item referencing User B's source photo (Provenance Spoof)
  {
    const { data, error } = await clientA.rpc('create_draft_wardrobe_item', {
      p_image_url: 'https://example.com/exploit-spoof-photo.jpg',
      p_source_photo_id: sourcePhotoBId,
    });
    const pass = error != null && data == null;
    recordResult(
      'Group H',
      'User A links User B source photo (Provenance Spoof)',
      'Exception / ownership mismatch (DENIED)',
      error ? `Blocked: ${error.message}` : `Exploit succeeded: ${data}`,
      pass
    );
  }

  // =========================================================================
  // GROUP I: Concurrency & Atomicity Tests
  // =========================================================================
  console.log('\n--- GROUP I: Concurrency & Atomicity Verification ---');

  // I1: Concurrency Serialization (Two workers competing on same item)
  {
    const { data: concItemId } = await clientA.rpc('create_draft_wardrobe_item', {
      p_image_url: 'https://example.com/conc-test.jpg',
      p_source_photo_id: sourcePhotoAId,
    });

    const [res1, res2] = await Promise.allSettled([
      serviceClient.rpc('transition_wardrobe_item_processing_state', {
        p_item_id: concItemId,
        p_target_status: 'isolating',
        p_user_id: userAId,
      }),
      serviceClient.rpc('transition_wardrobe_item_processing_state', {
        p_item_id: concItemId,
        p_target_status: 'isolating',
        p_user_id: userAId,
      }),
    ]);

    // One must succeed, while the serialized second attempt fails (isolating -> isolating is invalid FSM)
    const successCount = [res1, res2].filter(r => r.status === 'fulfilled' && !r.value.error).length;
    const { data: concRow } = await serviceClient.from('wardrobe_items').select('processing_status').eq('id', concItemId).single();
    const pass = successCount === 1 && concRow?.processing_status === 'isolating';
    recordResult(
      'Group I',
      'Concurrent worker transition serialization (FOR UPDATE lock)',
      'Exactly 1 transition committed, final state isolating',
      `Successes: ${successCount}, Final DB State: ${concRow?.processing_status}`,
      pass
    );
  }

  // =========================================================================
  // GROUP J: Failure and Edge Cases
  // =========================================================================
  console.log('\n--- GROUP J: Failure and Edge Cases ---');

  // J1: Non-existent item UUID transition attempt by service-role
  {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const { data, error } = await serviceClient.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: fakeId,
      p_target_status: 'isolating',
      p_user_id: userAId,
    });
    const pass = error != null;
    recordResult('Group J', 'Transition non-existent item UUID', 'Exception (DENIED)', error ? error.message : `Unexpected: ${data}`, pass);
  }

  // J2: Unauthenticated caller calls transition RPC
  {
    const { data, error } = await anonClient.rpc('transition_wardrobe_item_processing_state', {
      p_item_id: freshTestItemId,
      p_target_status: 'isolating',
      p_user_id: userAId,
    });
    const pass = error != null;
    recordResult('Group J', 'Unauthenticated caller calls transition RPC', 'Exception / 42501 (DENIED)', error ? error.message : `Unexpected: ${data}`, pass);
  }

  // J3: Draft creation with non-existent source photo UUID
  {
    const fakePhotoId = '00000000-0000-0000-0000-000000000000';
    const { data, error } = await clientA.rpc('create_draft_wardrobe_item', {
      p_image_url: 'https://example.com/phantom-photo.jpg',
      p_source_photo_id: fakePhotoId,
    });
    const pass = error != null;
    recordResult('Group J', 'Draft creation with non-existent source photo', 'Exception (DENIED)', error ? error.message : `Unexpected: ${data}`, pass);
  }

  // =========================================================================
  // Final Summary & Exit
  // =========================================================================
  console.log('\n══════════════════════════════════════════════════════════════════════════');
  const passedCount = testResults.filter((r) => r.result === 'PASS').length;
  console.log(`Gate 2B Test Summary: ${passedCount} / ${testResults.length} PASSED`);
  if (allPassed) {
    console.log('🎉 ALL GATE 2B SECURITY TESTS PASSED!');
  } else {
    console.log('❌ SOME TESTS FAILED. See log above for details.');
  }
  console.log('══════════════════════════════════════════════════════════════════════════\n');

  process.exit(allPassed ? 0 : 1);
}

main().catch((err) => {
  console.error('❌ Fatal error during test execution:', err);
  process.exit(1);
});
