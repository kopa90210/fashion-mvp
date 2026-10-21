/**
 * scripts/seed_wardrobe_items.mjs
 * 
 * Seeds wardrobe_items and joins for Gate 2 tests.
 * Assumes source_photos already exist.
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
  process.exit(1);
}

// Use service role (bypass RLS) for seeding
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// User IDs from test account setup
const USER_A_ID = 'a2979897-5d2c-4963-863b-1508bba38359';
const USER_B_ID = 'ac432fa7-7140-4b5a-924e-a7d7119944c9';

// Source photo IDs from previous seed
const SOURCE_PHOTO_A_ID = '1844c5bb-6074-4454-997d-3f4bde58d857';
const SOURCE_PHOTO_B_ID = '93734fc4-325b-4a0c-8d50-6d62d14736ad';

async function seedWardrobe() {
  console.log('🌱 Seeding wardrobe items for Gate 2 tests...\n');

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // 1. Create wardrobe_items for User A
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👕 Creating wardrobe_item for User A...');
    const { data: itemA, error: itemAErr } = await supabase
      .from('wardrobe_items')
      .insert({
        source_photo_id: SOURCE_PHOTO_A_ID,
        image_url: 'https://example.com/item-a.jpg',
        display_name: 'Test Shirt - User A',
        source: 'user_upload',
        category: 'top',
        color: { name: 'blue' },
        material: { name: 'cotton' },
        fit: { name: 'regular' },
        pattern: 'solid',
        style_tags: { tags: ['casual'] },
        processing_status: 'extracted',
        prettify_status: 'none',
        crop_box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
      })
      .select('id')
      .single();

    if (itemAErr) {
      console.error('❌ Error creating wardrobe_item for User A:', itemAErr.message);
      process.exit(1);
    }
    console.log(`✅ User A wardrobe_item created: ${itemA.id}\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // 2. Create user_wardrobe_items join for User A
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔗 Creating user_wardrobe_items join for User A...');
    const { error: joinAErr } = await supabase
      .from('user_wardrobe_items')
      .insert({
        user_id: USER_A_ID,
        item_id: itemA.id
      });

    if (joinAErr) {
      console.error('❌ Error creating join for User A:', joinAErr.message);
      process.exit(1);
    }
    console.log(`✅ User A join created\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // 3. Create wardrobe_items for User B
    // ─────────────────────────────────────────────────────────────────────────
    console.log('👕 Creating wardrobe_item for User B...');
    const { data: itemB, error: itemBErr } = await supabase
      .from('wardrobe_items')
      .insert({
        source_photo_id: SOURCE_PHOTO_B_ID,
        image_url: 'https://example.com/item-b.jpg',
        display_name: 'Test Pants - User B',
        source: 'user_upload',
        category: 'bottom',
        color: { name: 'black' },
        material: { name: 'denim' },
        fit: { name: 'slim' },
        pattern: 'solid',
        style_tags: { tags: ['casual'] },
        processing_status: 'extracted',
        prettify_status: 'none',
        crop_box: { x: 0.15, y: 0.25, width: 0.25, height: 0.5 }
      })
      .select('id')
      .single();

    if (itemBErr) {
      console.error('❌ Error creating wardrobe_item for User B:', itemBErr.message);
      process.exit(1);
    }
    console.log(`✅ User B wardrobe_item created: ${itemB.id}\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // 4. Create user_wardrobe_items join for User B
    // ─────────────────────────────────────────────────────────────────────────
    console.log('🔗 Creating user_wardrobe_items join for User B...');
    const { error: joinBErr } = await supabase
      .from('user_wardrobe_items')
      .insert({
        user_id: USER_B_ID,
        item_id: itemB.id
      });

    if (joinBErr) {
      console.error('❌ Error creating join for User B:', joinBErr.message);
      process.exit(1);
    }
    console.log(`✅ User B join created\n`);

    console.log('════════════════════════════════════════════════════════');
    console.log('✅ Test data seeded successfully!\n');
    console.log('Ready to run: node scripts/test_rls.mjs');
    console.log('════════════════════════════════════════════════════════');

    process.exit(0);
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
    process.exit(1);
  }
}

seedWardrobe();
