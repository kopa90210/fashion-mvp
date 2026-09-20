/**
 * Tests for src/app/actions/wardrobe.ts
 *
 * Run with:  npx vitest run src/app/actions/wardrobe.test.ts
 *
 * All Supabase calls are mocked — no real database is hit.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

const privateMediaMocks = vi.hoisted(() => ({
  uploadValidatedPrivateImage: vi.fn(),
  deletePrivateObject: vi.fn(),
  signedOwnedPrivateUrl: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/src/lib/media/private-media', () => privateMediaMocks)

// ---------------------------------------------------------------------------
// Supabase mock setup
// ---------------------------------------------------------------------------

let tableResponses: Record<
  string,
  { data: unknown; error: unknown }
> = {}

let upsertCalls: Record<string, unknown[]> = {}
let rpcCalls: Array<{ name: string; args: unknown }> = []

function createQueryBuilder(tableName: string) {
  const response = () =>
    tableResponses[tableName] ?? { data: null, error: null }

  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => response()),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockImplementation((payload: unknown) => {
      if (!upsertCalls[tableName]) upsertCalls[tableName] = []
      upsertCalls[tableName].push(payload)
      return builder
    }),
  }

  builder.then = (resolve: (v: unknown) => unknown) => resolve(response())
  return builder
}

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn().mockImplementation((table: string) => createQueryBuilder(table)),
  rpc: vi.fn().mockImplementation((name: string, args: unknown) => {
    rpcCalls.push({ name, args })
    return Promise.resolve({ data: null, error: null })
  }),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null }),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://images.test/replaced.jpg' } })),
    })),
  },
}

vi.mock('@/src/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

// ---------------------------------------------------------------------------
// Import functions under test
// ---------------------------------------------------------------------------

const { getCuratedPieces, getRankedPieces, searchPieces, saveWardrobeSelection, findOrphanedWardrobeItems, replaceWardrobeItemPhoto, updateWardrobeItemAttributes, removeWardrobeItem, uploadDraftWardrobeItem, uploadOutfitPhoto, confirmOutfitPhotoDraft, confirmDraftItem } = await import(
  '@/src/app/actions/wardrobe'
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-abc-123'

function mockAuthenticatedUser() {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: TEST_USER_ID } },
    error: null,
  })
}

/** Generate N mock wardrobe items in a given category. */
function makeItems(
  category: string,
  count: number,
  tagValue = 0.5,
) {
  return Array.from({ length: count }, (_, i) => ({
    id: `${category}-${i}`,
    category,
    subcategory: category,
    image_url: `/img/${category}-${i}.jpg`,
    display_name: `${category} item ${i}`,
    layer_role: category === 'top' ? 'base_layer' : category,
    style_tags: { minimal: tagValue - i * 0.05 },
    model_confidence: 0.95,
    color: { primary: 'black', family_weights: { dark: 1.0 } },
    fit: { weights: { regular: 1.0 } },
  }))
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  tableResponses = {}
  upsertCalls = {}
  rpcCalls = []
  privateMediaMocks.uploadValidatedPrivateImage.mockResolvedValue({ bucket: 'private-wardrobe-media', path: `${TEST_USER_ID}/asset.jpg`, mimeType: 'image/jpeg', byteSize: 5, sha256: 'hash', width: 1, height: 1, stableUrl: `private://private-wardrobe-media/${TEST_USER_ID}/asset.jpg` })
  privateMediaMocks.deletePrivateObject.mockResolvedValue(undefined)
  privateMediaMocks.signedOwnedPrivateUrl.mockResolvedValue('https://signed.test/item.jpg')
})

describe('removeWardrobeItem', () => {
  it('uses the atomic ownership-preserving removal RPC', async () => {
    mockAuthenticatedUser()

    await removeWardrobeItem('item-123')

    expect(rpcCalls).toEqual([
      { name: 'remove_user_wardrobe_item', args: { p_item_id: 'item-123' } },
    ])
  })
})

// ---------------------------------------------------------------------------
// getRankedPieces — threshold-ranked & paginated
// ---------------------------------------------------------------------------

describe('getRankedPieces', () => {
  it('produces visibly different result counts for sharp vs. broad fashion DNA', async () => {
    mockAuthenticatedUser()

    // 10 top items with varying tag weights
    const topItems = Array.from({ length: 10 }, (_, i) => ({
      id: `top-${i}`,
      category: 'top',
      subcategory: 'shirt',
      image_url: `/img/top-${i}.jpg`,
      display_name: `Top Item ${i}`,
      layer_role: 'base_layer',
      style_tags: { minimal: 1.0 - i * 0.1, streetwear: i * 0.1 },
    }))

    tableResponses['wardrobe_items'] = { data: topItems, error: null }

    // Test A: Sharp vector heavily weighted on minimal (1.0 vs 0.0)
    tableResponses['fashion_dna'] = {
      data: { vector: { minimal: 1.0, streetwear: 0.0 } },
      error: null,
    }
    const sharpResult = await getRankedPieces('top', 0)

    // Test B: Broad vector with flatter weights (0.5 vs 0.5)
    tableResponses['fashion_dna'] = {
      data: { vector: { minimal: 0.5, streetwear: 0.5 } },
      error: null,
    }
    const broadResult = await getRankedPieces('top', 0)

    // Sharp vector produces fewer high-confidence threshold matches than broad vector
    expect(sharpResult.items.length).not.toEqual(broadResult.items.length)
  })

  it('clamps result counts to floor of 4 and ceiling of 14', async () => {
    mockAuthenticatedUser()
    tableResponses['fashion_dna'] = {
      data: { vector: { minimal: 0.9 } },
      error: null,
    }

    // 20 items in top category
    const items = makeItems('top', 20, 0.9)
    tableResponses['wardrobe_items'] = { data: items, error: null }

    const res = await getRankedPieces('top', 0)
    expect(res.items.length).toBeGreaterThanOrEqual(4)
    expect(res.items.length).toBeLessThanOrEqual(14)
  })

  it('never exposes style_tags, score, or internal fields', async () => {
    mockAuthenticatedUser()
    tableResponses['fashion_dna'] = {
      data: { vector: { minimal: 0.8 } },
      error: null,
    }
    tableResponses['wardrobe_items'] = {
      data: makeItems('top', 5, 0.8),
      error: null,
    }

    const res = await getRankedPieces('top', 0)
    expect(res.items.length).toBeGreaterThan(0)

    for (const item of res.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['category', 'display_name', 'id', 'image_url'].sort(),
      )
      expect(item).not.toHaveProperty('style_tags')
      expect(item).not.toHaveProperty('score')
    }
  })
})

// ---------------------------------------------------------------------------
// searchPieces — category-scoped ILIKE search
// ---------------------------------------------------------------------------

describe('searchPieces', () => {
  it('returns items matching query scoped strictly to requested category', async () => {
    mockAuthenticatedUser()

    const items = [
      { id: 't1', category: 'top', subcategory: 't-shirt', display_name: 'White Linen Shirt', image_url: null, layer_role: 'base_layer' },
      { id: 't2', category: 'top', subcategory: 'sweater', display_name: 'Black Hoodie', image_url: null, layer_role: 'base_layer' },
      { id: 'b1', category: 'bottom', subcategory: 'pant', display_name: 'White Chino Pants', image_url: null, layer_role: 'bottom' },
    ]
    tableResponses['wardrobe_items'] = { data: items, error: null }

    // Search for "White" in 'top' category — should return 't1' but NOT 'b1' (which is a bottom)
    const topResults = await searchPieces('top', 'white')
    expect(topResults).toHaveLength(1)
    expect(topResults[0].id).toBe('t1')

    // Search for "white" in 'bottom' category — should return 'b1'
    const bottomResults = await searchPieces('bottom', 'white')
    expect(bottomResults).toHaveLength(1)
    expect(bottomResults[0].id).toBe('b1')
  })

  it('prefers the stored category over mixed layer-role text when scoping search results', async () => {
    mockAuthenticatedUser()

    tableResponses['wardrobe_items'] = {
      data: [
        {
          id: 'mixed-top',
          category: 'top',
          subcategory: 'shirt',
          display_name: 'White Oxford Shirt',
          image_url: null,
          layer_role: 'bottom',
        },
      ],
      error: null,
    }

    const topResults = await searchPieces('top', 'white')
    expect(topResults).toHaveLength(1)
    expect(topResults[0].id).toBe('mixed-top')
  })

  it('never exposes internal or scoring fields in search results', async () => {
    mockAuthenticatedUser()

    tableResponses['wardrobe_items'] = {
      data: [
        { id: 't1', category: 'top', subcategory: 'shirt', display_name: 'Oxford Shirt', image_url: null, layer_role: 'base_layer', style_tags: { formal: 0.9 } },
      ],
      error: null,
    }

    const results = await searchPieces('top', 'oxford')
    expect(results).toHaveLength(1)
    expect(Object.keys(results[0]).sort()).toEqual(
      ['category', 'display_name', 'id', 'image_url'].sort(),
    )
  })
})

// ---------------------------------------------------------------------------
// saveWardrobeSelection - five-category round trip
// ---------------------------------------------------------------------------

describe('saveWardrobeSelection', () => {
  it('upserts every selected item across all five wardrobe categories', async () => {
    mockAuthenticatedUser()

    const selectedIdsByCategory = {
      top: ['top-1', 'top-2'],
      bottom: ['bottom-1', 'bottom-2'],
      footwear: ['footwear-1', 'footwear-2'],
      outerwear: ['outerwear-1'],
      accessory: ['accessory-1'],
    }
    const selectedIds = Object.values(selectedIdsByCategory).flat()

    const result = await saveWardrobeSelection(selectedIds)
    expect(result).toEqual({ success: true })

    const [payload] = upsertCalls['user_wardrobe_items'] as Array<
      Array<{ user_id: string; item_id: string }>
    >
    const mockedFetchRows = payload.map((row) => ({ item_id: row.item_id }))

    expect(payload).toHaveLength(selectedIds.length)
    expect(payload.map((row) => row.user_id)).toEqual(
      selectedIds.map(() => TEST_USER_ID),
    )
    expect(mockedFetchRows.map((row) => row.item_id).sort()).toEqual(
      [...selectedIds].sort(),
    )
  })
})
// ---------------------------------------------------------------------------
// getCuratedPieces — backward compatibility
// ---------------------------------------------------------------------------

describe('getCuratedPieces', () => {
  it('returns at most 10 items per category', async () => {
    mockAuthenticatedUser()
    tableResponses['fashion_dna'] = {
      data: { vector: { minimal: 0.8 } },
      error: null,
    }

    const items = [
      ...makeItems('top', 12, 0.9),    // 12 tops → cap trims to 10
      ...makeItems('bottom', 7, 0.7),  // 7 bottoms → all fit under cap
      ...makeItems('footwear', 3, 0.6),
    ]
    tableResponses['wardrobe_items'] = { data: items, error: null }

    const result = await getCuratedPieces()

    for (const [, categoryItems] of Object.entries(result)) {
      expect(categoryItems.length).toBeLessThanOrEqual(10)
    }

    expect(result['top'].length).toBe(10)
  })
})


describe('findOrphanedWardrobeItems', () => {
  it('reports invalid roles and cross-references only affected users', async () => {
    tableResponses['wardrobe_items'] = {
      data: [
        { id: 'bad-1', layer_role: null, user_wardrobe_items: [{ user_id: 'u1' }, { user_id: 'u2' }] },
        { id: 'bad-2', layer_role: 'not-a-role', user_wardrobe_items: [{ user_id: 'u1' }] },
        { id: 'good-1', layer_role: 'bottom', user_wardrobe_items: [{ user_id: 'u2' }] },
      ],
      error: null,
    }
    await expect(findOrphanedWardrobeItems()).resolves.toEqual({
      total: 2,
      byUser: { u1: 2, u2: 1 },
    })
  })
})

describe('replaceWardrobeItemPhoto', () => {
  it('records private media and attaches it through the ownership RPC', async () => {
    mockAuthenticatedUser()
    tableResponses['media_assets'] = { data: { id: 'asset-1' }, error: null }
    await expect(replaceWardrobeItemPhoto('item-1', new File(['photo'], 'new.jpg', { type: 'image/jpeg' }))).resolves.toEqual({ success: true })
    expect(privateMediaMocks.uploadValidatedPrivateImage).toHaveBeenCalledWith(TEST_USER_ID, expect.any(File))
    expect(rpcCalls).toContainEqual({ name: 'attach_media_asset_to_wardrobe_item', args: { p_item_id: 'item-1', p_media_asset_id: 'asset-1' } })
  })
})

describe('uploadDraftWardrobeItem', () => {
  it('queues extraction only after the private media is attached', async () => {
    mockAuthenticatedUser()
    tableResponses['media_assets'] = { data: { id: 'asset-1' }, error: null }
    mockSupabase.rpc.mockImplementation(async (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      return { data: name === 'create_draft_wardrobe_item' ? 'item-1' : null, error: null }
    })
    await expect(uploadDraftWardrobeItem(new File(['photo'], 'new.jpg', { type: 'image/jpeg' })))
      .resolves.toEqual({ success: true, itemId: 'item-1' })
    expect(rpcCalls.map(({ name }) => name)).toEqual([
      'create_draft_wardrobe_item',
      'attach_media_asset_to_wardrobe_item',
      'enqueue_wardrobe_extraction_job',
    ])
    expect(rpcCalls[2].args).toEqual({ p_item_id: 'item-1' })
  })
})

describe('outfit photo upload', () => {
  it('persists private source media before enqueueing a multi-garment job', async () => {
    vi.stubEnv('ENABLE_OUTFIT_PHOTO_UPLOAD', 'true')
    mockAuthenticatedUser()
    tableResponses['media_assets'] = { data: { id: 'asset-1' }, error: null }
    tableResponses['source_photos'] = { data: { id: 'photo-1' }, error: null }
    mockSupabase.rpc.mockImplementation(async (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      return { data: 'job-1', error: null }
    })
    await expect(uploadOutfitPhoto(new File(['photo'], 'outfit.jpg', { type: 'image/jpeg' })))
      .resolves.toEqual({ sourcePhotoId: 'photo-1', jobId: 'job-1' })
    expect(rpcCalls).toContainEqual({ name: 'enqueue_outfit_photo_job', args: { p_source_photo_id: 'photo-1' } })
    expect(mockSupabase.from).toHaveBeenCalledWith('source_photos')
    vi.unstubAllEnvs()
  })

  it('requires the feature flag before storing user media', async () => {
    vi.stubEnv('ENABLE_OUTFIT_PHOTO_UPLOAD', 'false')
    await expect(uploadOutfitPhoto(new File(['photo'], 'outfit.jpg', { type: 'image/jpeg' })))
      .rejects.toThrow('not enabled')
    expect(privateMediaMocks.uploadValidatedPrivateImage).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('confirms a reviewed garment through the ownership RPC', async () => {
    mockAuthenticatedUser()
    mockSupabase.rpc.mockImplementation(async (name: string, args: unknown) => {
      rpcCalls.push({ name, args })
      return { data: null, error: null }
    })
    await expect(confirmOutfitPhotoDraft('item-1', false)).resolves.toEqual({ success: true })
    expect(rpcCalls).toContainEqual({ name: 'confirm_outfit_photo_draft', args: {
      p_item_id: 'item-1', p_use_reconstructed: false,
    } })
  })

  it('routes a generic confirm for an outfit draft through the same ownership RPC', async () => {
    mockAuthenticatedUser()
    tableResponses['wardrobe_items'] = { data: { source_photo_id: 'photo-1' }, error: null }
    await expect(confirmDraftItem('item-1')).resolves.toEqual({ success: true })
    expect(rpcCalls).toContainEqual({ name: 'confirm_outfit_photo_draft', args: {
      p_item_id: 'item-1', p_use_reconstructed: false,
    } })
  })
})

describe('updateWardrobeItemAttributes', () => {
  it('updates allowed attributes and derives the normalized layer role', async () => {
    mockAuthenticatedUser()
    await expect(updateWardrobeItemAttributes('item-1', { category: 'footwear', subcategory: 'sneakers', brand: 'Acme', color: { primary: 'white' }, fit: {}, style_tags: {} })).resolves.toEqual({ success: true })
  })
})
