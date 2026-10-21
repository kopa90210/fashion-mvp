/**
 * scripts/seed_gate2_test_data.mjs
 * 
 * Seeds deterministic, idempotent test fixtures for Phase 4B Gate 2 RLS & State Transition tests.
 * Uses service role to set up:
 *   - User A and User B accounts (via admin API if missing)
 *   - Curated catalog wardrobe items
 *   - User A source photo, uploaded wardrobe item, and join link
 *   - User B source photo, uploaded wardrobe item, and join link
 */

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// Helper to load environment variables from .env.local / .env
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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const USER_A_EMAIL = process.env.RLS_TEST_USER_A_EMAIL;
const USER_A_PASSWORD = process.env.RLS_TEST_USER_A_PASSWORD;
const USER_B_EMAIL = process.env.RLS_TEST_USER_B_EMAIL;
const USER_B_PASSWORD = process.env.RLS_TEST_USER_B_PASSWORD;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('❌ Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
  process.exit(1);
}

if (!USER_A_EMAIL || !USER_A_PASSWORD || !USER_B_EMAIL || !USER_B_PASSWORD) {
  console.error('❌ Missing test user credentials in environment (RLS_TEST_USER_A_EMAIL, RLS_TEST_USER_A_PASSWORD, RLS_TEST_USER_B_EMAIL, RLS_TEST_USER_B_PASSWORD).');
  console.error('   Please define them in .env.local or process environment.');
  process.exit(1);
}

const adminSupabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getOrCreateUser(email, password) {
  const { data: usersData, error: listErr } = await adminSupabase.auth.admin.listUsers();
  if (listErr) throw new Error(`Failed to list users: ${listErr.message}`);

  const existing = usersData.users.find((u) => u.email === email);
  if (existing) {
    await adminSupabase.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
    return existing.id;
  }

  const { data: created, error: createErr } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr) throw new Error(`Failed to create test user ${email}: ${createErr.message}`);
  return created.user.id;
}

async function seed() {
  console.log('🌱 Seeding Phase 4B Gate 2 Test Fixtures...\n');

  // 1. Resolve User A and User B
  const userAId = await getOrCreateUser(USER_A_EMAIL, USER_A_PASSWORD);
  const userBId = await getOrCreateUser(USER_B_EMAIL, USER_B_PASSWORD);
  console.log(`✓ User A ID: ${userAId}`);
  console.log(`✓ User B ID: ${userBId}`);

  // Ensure public.users and fashion_dna rows exist for both
  for (const uid of [userAId, userBId]) {
    await adminSupabase.from('users').upsert({ id: uid });
    await adminSupabase.from('fashion_dna').upsert({
      user_id: uid,
      vector: { casual: 0.8, formal: 0.2, minimal: 0.9 },
    });
  }

  // 2. Clean up old test data cleanly
  console.log('🧹 Cleaning prior test fixtures...');
  
  // Find test wardrobe items
  const { data: oldItems } = await adminSupabase
    .from('wardrobe_items')
    .select('id')
    .ilike('display_name', 'Gate2 Test %');
    
  if (oldItems && oldItems.length > 0) {
    const ids = oldItems.map(i => i.id);
    await adminSupabase.from('user_wardrobe_items').delete().in('item_id', ids);
    await adminSupabase.from('wardrobe_items').delete().in('id', ids);
  }

  await adminSupabase
    .from('source_photos')
    .delete()
    .in('user_id', [userAId, userBId])
    .ilike('idempotency_key', 'gate2-test-%');

  // 3. Create Curated Catalog Item (for testing curated vs user_upload RLS)
  const { data: existingCurated } = await adminSupabase
    .from('wardrobe_items')
    .select('id')
    .eq('source', 'curated')
    .limit(1);

  let curatedItemId;
  if (existingCurated && existingCurated.length > 0) {
    curatedItemId = existingCurated[0].id;
  } else {
    const { data: newCurated, error: curErr } = await adminSupabase
      .from('wardrobe_items')
      .insert({
        source: 'curated',
        category: 'top',
        subcategory: 't-shirt',
        display_name: 'Curated Classic White Tee',
        image_url: 'https://example.com/curated-white-tee.jpg',
        color: { primary: 'white' },
        fit: { style: 'regular' },
        status: 'confirmed',
      })
      .select('id')
      .single();
    if (curErr) throw new Error(`Failed to create curated item: ${curErr.message}`);
    curatedItemId = newCurated.id;
  }
  console.log(`✓ Curated Item ID: ${curatedItemId}`);

  // 4. Create User A source photo + user-upload wardrobe item
  const { data: photoA, error: photoAErr } = await adminSupabase
    .from('source_photos')
    .insert({
      user_id: userAId,
      image_url: 'https://example.com/user-a-source.jpg',
      status: 'uploading',
      idempotency_key: `gate2-test-a-${Date.now()}`,
      file_hash: 'hash-a-gate2',
    })
    .select('id')
    .single();
  if (photoAErr) throw new Error(`Failed to create User A source photo: ${photoAErr.message}`);

  const { data: itemA, error: itemAErr } = await adminSupabase
    .from('wardrobe_items')
    .insert({
      source_photo_id: photoA.id,
      image_url: 'https://example.com/user-a-crop.jpg',
      display_name: 'Gate2 Test Oxford Shirt A',
      source: 'user_upload',
      category: 'top',
      subcategory: 'shirt',
      status: 'draft',
      processing_status: 'detected',
      prettify_status: 'none',
      crop_box: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
    })
    .select('id')
    .single();
  if (itemAErr) throw new Error(`Failed to create User A wardrobe item: ${itemAErr.message}`);

  await adminSupabase
    .from('user_wardrobe_items')
    .upsert({ user_id: userAId, item_id: itemA.id, quantity: 1 });

  console.log(`✓ User A Source Photo: ${photoA.id}`);
  console.log(`✓ User A Wardrobe Item: ${itemA.id}`);

  // 5. Create User B source photo + user-upload wardrobe item
  const { data: photoB, error: photoBErr } = await adminSupabase
    .from('source_photos')
    .insert({
      user_id: userBId,
      image_url: 'https://example.com/user-b-source.jpg',
      status: 'uploading',
      idempotency_key: `gate2-test-b-${Date.now()}`,
      file_hash: 'hash-b-gate2',
    })
    .select('id')
    .single();
  if (photoBErr) throw new Error(`Failed to create User B source photo: ${photoBErr.message}`);

  const { data: itemB, error: itemBErr } = await adminSupabase
    .from('wardrobe_items')
    .insert({
      source_photo_id: photoB.id,
      image_url: 'https://example.com/user-b-crop.jpg',
      display_name: 'Gate2 Test Dark Denim B',
      source: 'user_upload',
      category: 'bottom',
      subcategory: 'jeans',
      status: 'draft',
      processing_status: 'detected',
      prettify_status: 'none',
      crop_box: { x: 0.2, y: 0.2, width: 0.6, height: 0.6 },
    })
    .select('id')
    .single();
  if (itemBErr) throw new Error(`Failed to create User B wardrobe item: ${itemBErr.message}`);

  await adminSupabase
    .from('user_wardrobe_items')
    .upsert({ user_id: userBId, item_id: itemB.id, quantity: 1 });

  console.log(`✓ User B Source Photo: ${photoB.id}`);
  console.log(`✓ User B Wardrobe Item: ${itemB.id}`);

  console.log('\n========================================================');
  console.log('✅ Gate 2 test fixtures seeded successfully and ready for test_rls.mjs!');
  console.log('========================================================\n');
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
