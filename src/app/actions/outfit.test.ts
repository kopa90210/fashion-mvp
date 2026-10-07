/**
 * Tests for src/app/actions/outfit.ts
 *
 * Run with:  npx vitest run src/app/actions/outfit.test.ts
 *
 * All Supabase calls are mocked — no real database is hit.
 * The mock uses a chainable builder that mirrors the Supabase
 * PostgREST API so each `.from('table').select(...).eq(...)` chain
 * resolves to whatever fixture data the test configures.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mediaMocks = vi.hoisted(() => ({
  signedOwnedPrivateUrl: vi.fn(async (_client: unknown, id: string) => `https://signed.test/${id}`),
}))
vi.mock('@/src/lib/media/private-media', () => mediaMocks)

// ---------------------------------------------------------------------------
// Supabase mock setup
// ---------------------------------------------------------------------------

/**
 * tableResponses lets each test say "when someone queries table X,
 * return this data/error". The mock builder reads from here.
 */
let tableResponses: Record<
  string,
  { data: unknown; error: unknown }
> = {}

let tableResponseSequences: Record<
  string,
  { data: unknown; error: unknown }[]
> = {}

/** Track which tables had .insert() called and with what payload. */
let insertCalls: Record<string, unknown[]> = {}

/** Track which tables had .update() called and with what payload. */
let updateCalls: Record<string, unknown[]> = {}

let rpcCalls: Array<{ name: string; payload: unknown }> = []
let rpcResponse: { data: unknown; error: unknown } = { data: 'saved', error: null }

let queryBuilders: Array<{ table: string; builder: Record<string, unknown> }> = []

/**
 * Build a chainable mock that mimics the Supabase query builder.
 *
 * Every chaining method (select, eq, in, single, insert, update)
 * returns `this` so the chain keeps working.  The terminal methods
 * (single, execute, or awaiting the builder itself) resolve the
 * configured fixture from `tableResponses[tableName]`.
 */
function createQueryBuilder(tableName: string) {
  const response = () => {
    const sequence = tableResponseSequences[tableName]
    if (sequence?.length) {
      return sequence.shift() ?? { data: null, error: null }
    }
    return tableResponses[tableName] ?? { data: null, error: null }
  }

  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lte: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => response()),
    insert: vi.fn().mockImplementation((payload: unknown) => {
      if (!insertCalls[tableName]) insertCalls[tableName] = []
      insertCalls[tableName].push(payload)
      // Return a builder that supports chaining .select().single()
      const insertBuilder: Record<string, unknown> = {
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => response()),
        eq: vi.fn().mockReturnThis(),
      }
      // Make the insert builder thenable so `await supabase.from().insert()` works
      insertBuilder.then = (resolve: (v: unknown) => unknown) =>
        resolve(response())
      return insertBuilder
    }),
    update: vi.fn().mockImplementation((payload: unknown) => {
      if (!updateCalls[tableName]) updateCalls[tableName] = []
      updateCalls[tableName].push(payload)
      const updateBuilder: Record<string, unknown> = {
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockImplementation(() => response()),
      }
      updateBuilder.then = (resolve: (v: unknown) => unknown) =>
        resolve(response())
      return updateBuilder
    }),
    upsert: vi.fn().mockReturnThis(),
  }

  // Make the builder itself thenable so plain `await` resolves it
  builder.then = (resolve: (v: unknown) => unknown) => resolve(response())
  queryBuilders.push({ table: tableName, builder })
  return builder
}

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn().mockImplementation((table: string) => createQueryBuilder(table)),
  rpc: vi.fn().mockImplementation((name: string, payload: unknown) => {
    rpcCalls.push({ name, payload })
    return Promise.resolve(rpcResponse)
  }),
}

vi.mock('@/src/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('@/src/lib/outfit/engine', async (importActual) => {
  const actual = await importActual<typeof import('@/src/lib/outfit/engine')>()
  return {
    ...actual,
    recommendOutfits: vi.fn(actual.recommendOutfits),
  }
})

// ---------------------------------------------------------------------------
// Import functions under test (after the mock is set up)
// ---------------------------------------------------------------------------

const {
  getCalibrationOutfits,
  getDailyOutfit,
  shouldShowOutfitCalibration,
  submitOutfitFeedback,
  skipOutfitCalibration,
} = await import('@/src/app/actions/outfit')
const outfitEngine = await import('@/src/lib/outfit/engine')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER_ID = 'user-abc-123'
const DNA = { minimal: 0.8, streetwear: 0.2, formal: 0.1 }

/** Convenience to set a Supabase table's mock response. */
function mockTable(table: string, data: unknown, error: unknown = null) {
  if ((table === 'user_wardrobe_items' || table === 'user_style_seed_items') && Array.isArray(data)) {
    data = data.map((row) => {
      if (!row || typeof row !== 'object') return row
      const record = row as Record<string, unknown>
      const item = record.wardrobe_items
      if (!item || typeof item !== 'object' || Array.isArray(item)) return row
      return { ...record, retired_at: record.retired_at ?? null,
        wardrobe_items: { status: 'confirmed', media_asset_id: null, ...item } }
    })
  }
  tableResponses[table] = { data, error }
}

function mockTableSequence(table: string, responses: Array<{ data: unknown; error?: unknown }>) {
  tableResponseSequences[table] = responses.map((response) => ({
    data: response.data,
    error: response.error ?? null,
  }))
}

function mockAuthenticatedUser() {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: TEST_USER_ID } },
    error: null,
  })
}

// ---------------------------------------------------------------------------
// Reset state between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  tableResponses = {}
  tableResponseSequences = {}
  insertCalls = {}
  updateCalls = {}
  rpcCalls = []
  rpcResponse = { data: 'saved', error: null }
  queryBuilders = []
  delete process.env.ENABLE_AI_DAILY_OUTFITS
  vi.stubEnv('AI_OUTFIT_SERVICE_URL', '')
})

// ---------------------------------------------------------------------------
// getDailyOutfit
// ---------------------------------------------------------------------------

describe('getDailyOutfit', () => {
  it('returns a daily outfit from one owned dress and footwear', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('users', { timezone: 'UTC' })
    mockTable('outfits', [])
    mockTable('user_wardrobe_items', [
      { wardrobe_items: { id: 'dress-1', display_name: 'Midi dress', category: 'one_piece', image_url: null,
        layer_role: 'one_piece', style_tags: { minimal: 0.9 } } },
      { wardrobe_items: { id: 'shoe-1', display_name: 'Shoes', category: 'footwear', image_url: null,
        layer_role: 'footwear', style_tags: { minimal: 0.8 } } },
    ])

    const result = await getDailyOutfit()
    expect(result?.items.map((piece) => piece.id)).toEqual(['dress-1', 'shoe-1'])
    expect(rpcCalls.some((call) => call.name === 'create_outfit_with_items')).toBe(true)
  })

  it('returns null when the user has fewer than 3 valid wardrobe items', async () => {
    mockAuthenticatedUser()

    // DNA exists
    mockTable('fashion_dna', { vector: DNA })

    // Only 2 items — missing footwear, so the engine can't build a
    // valid outfit (requires base_layer + bottom + footwear).
    mockTable('user_wardrobe_items', [
      {
        wardrobe_items: {
          id: 'tee-1',
          display_name: 'White Tee',
          image_url: null,
          layer_role: 'base_layer',
          style_tags: { minimal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'chino-1',
          display_name: 'Tan Chinos',
          image_url: null,
          layer_role: 'bottom',
          style_tags: { minimal: 0.7 },
        },
      },
    ])

    const result = await getDailyOutfit()
    expect(result).toBeNull()
  })

  it('does not recommend an extracted garment before the user confirms it', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_wardrobe_items', [
      { wardrobe_items: { id: 'tee', display_name: 'Tee', image_url: null,
        layer_role: 'base_layer', style_tags: { minimal: 0.8 } } },
      { wardrobe_items: { id: 'pants', display_name: 'Pants', image_url: null,
        layer_role: 'bottom', style_tags: { minimal: 0.8 } } },
      { wardrobe_items: { id: 'shoe-draft', display_name: 'Detected shoes', image_url: null,
        status: 'draft', layer_role: 'footwear', style_tags: { minimal: 0.8 } } },
    ])
    expect(await getDailyOutfit()).toBeNull()
  })

  it('returns a pre-generated AI outfit with stored reasons when the feature flag is on', async () => {
    process.env.ENABLE_AI_DAILY_OUTFITS = 'true'
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_wardrobe_items', [
      {
        wardrobe_items: {
          id: 'tee-1', display_name: 'Tee', image_url: 'private://private-wardrobe-media/old.png', media_asset_id: 'asset-tee',
          layer_role: 'base_layer', style_tags: { minimal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'chino-1', display_name: 'Chinos', image_url: null,
          layer_role: 'bottom', style_tags: { minimal: 0.7 },
        },
      },
      {
        wardrobe_items: {
          id: 'sneaker-1', display_name: 'Sneakers', image_url: null,
          layer_role: 'footwear', style_tags: { minimal: 0.8 },
        },
      },
    ])
    mockTable('outfits', {
      id: 'ai-outfit-1',
      item_ids: ['tee-1', 'chino-1', 'sneaker-1'],
      reasoning: ['stored reason one', 'stored reason two'],
    })

    const result = await getDailyOutfit()

    expect(result?.id).toBe('ai-outfit-1')
    expect(result?.items.map((item) => item.id)).toEqual(['tee-1', 'chino-1', 'sneaker-1'])
    expect(result?.items[0].image_url).toBe('https://signed.test/asset-tee')
    expect(result?.reasons).toEqual(['stored reason one', 'stored reason two'])
    expect(outfitEngine.recommendOutfits).not.toHaveBeenCalled()
  })

  it('falls through to the live engine when a stored AI outfit references a missing item', async () => {
    process.env.ENABLE_AI_DAILY_OUTFITS = 'true'
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_wardrobe_items', [
      {
        wardrobe_items: {
          id: 'tee-1', display_name: 'Tee', image_url: null,
          layer_role: 'base_layer', style_tags: { minimal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'chino-1', display_name: 'Chinos', image_url: null,
          layer_role: 'bottom', style_tags: { minimal: 0.7 },
        },
      },
      {
        wardrobe_items: {
          id: 'sneaker-1', display_name: 'Sneakers', image_url: null,
          layer_role: 'footwear', style_tags: { minimal: 0.8 },
        },
      },
    ])
    mockTableSequence('outfits', [
      {
        data: {
          id: 'stale-ai-outfit',
          item_ids: ['tee-1', 'chino-1', 'deleted-item'],
          reasoning: ['stale stored reason'],
        },
      },
      { data: [] },
      { data: { id: 'engine-outfit-1' } },
    ])

    const result = await getDailyOutfit()

    expect(result?.id).toBe('saved')
    expect(result?.items.map((item) => item.id)).toEqual(['tee-1', 'chino-1', 'sneaker-1'])
    expect(outfitEngine.recommendOutfits).toHaveBeenCalled()
  })

  it('falls through to the live engine when no stored daily AI row exists', async () => {
    process.env.ENABLE_AI_DAILY_OUTFITS = 'true'
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_wardrobe_items', [
      {
        wardrobe_items: {
          id: 'tee-1', display_name: 'Tee', image_url: null,
          layer_role: 'base_layer', style_tags: { minimal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'chino-1', display_name: 'Chinos', image_url: null,
          layer_role: 'bottom', style_tags: { minimal: 0.7 },
        },
      },
      {
        wardrobe_items: {
          id: 'sneaker-1', display_name: 'Sneakers', image_url: null,
          layer_role: 'footwear', style_tags: { minimal: 0.8 },
        },
      },
    ])
    mockTableSequence('outfits', [
      { data: null },
      { data: [] },
      { data: { id: 'engine-outfit-1' } },
    ])

    const result = await getDailyOutfit()

    expect(result?.id).toBe('saved')
    expect(outfitEngine.recommendOutfits).toHaveBeenCalled()
  })

  it('does not query the AI daily read path when the feature flag is off', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_wardrobe_items', [
      {
        wardrobe_items: {
          id: 'tee-1', display_name: 'Tee', image_url: null,
          layer_role: 'base_layer', style_tags: { minimal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'chino-1', display_name: 'Chinos', image_url: null,
          layer_role: 'bottom', style_tags: { minimal: 0.7 },
        },
      },
      {
        wardrobe_items: {
          id: 'sneaker-1', display_name: 'Sneakers', image_url: null,
          layer_role: 'footwear', style_tags: { minimal: 0.8 },
        },
      },
    ])
    mockTableSequence('outfits', [
      { data: [] },
      { data: { id: 'engine-outfit-1' } },
    ])

    const result = await getDailyOutfit()
    const outfitsSelects = queryBuilders
      .filter((query) => query.table === 'outfits')
      .map((query) => query.builder.select as ReturnType<typeof vi.fn>)

    expect(result?.id).toBe('saved')
    expect(outfitsSelects.some((select) => select.mock.calls.some((call) => call[0] === 'id, item_ids, reasoning'))).toBe(false)
  })
})


describe('style-seed isolation from daily outfits', () => {
  it('does not use style seeds when the owned wardrobe is empty', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_wardrobe_items', [])
    mockTable('user_style_seed_items', [
      { wardrobe_items: { id: 'seed-top', display_name: 'Seed Top', layer_role: 'base_layer', style_tags: { minimal: 0.9 } } },
      { wardrobe_items: { id: 'seed-bottom', display_name: 'Seed Bottom', layer_role: 'bottom', style_tags: { minimal: 0.8 } } },
      { wardrobe_items: { id: 'seed-shoe', display_name: 'Seed Shoe', layer_role: 'footwear', style_tags: { minimal: 0.7 } } },
    ])
    mockTable('users', { timezone: 'UTC' })
    mockTable('outfits', [])

    await expect(getDailyOutfit()).resolves.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// shouldShowOutfitCalibration
// ---------------------------------------------------------------------------

describe('shouldShowOutfitCalibration', () => {
  it('returns false when has_completed_calibration is true, regardless of item count', async () => {
    mockAuthenticatedUser()

    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_style_seed_items', [
      {
        wardrobe_items: {
          id: 'tee-1', display_name: 'Tee', image_url: null,
          layer_role: 'base_layer', style_tags: { minimal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'chino-1', display_name: 'Chinos', image_url: null,
          layer_role: 'bottom', style_tags: { minimal: 0.7 },
        },
      },
      {
        wardrobe_items: {
          id: 'sneaker-1', display_name: 'Sneakers', image_url: null,
          layer_role: 'footwear', style_tags: { minimal: 0.8 },
        },
      },
      {
        wardrobe_items: {
          id: 'shirt-1', display_name: 'Shirt', image_url: null,
          layer_role: 'base_layer', style_tags: { formal: 0.8 },
        },
      },
      {
        wardrobe_items: {
          id: 'trousers-1', display_name: 'Trousers', image_url: null,
          layer_role: 'bottom', style_tags: { formal: 0.8 },
        },
      },
      {
        wardrobe_items: {
          id: 'derby-1', display_name: 'Derbies', image_url: null,
          layer_role: 'footwear', style_tags: { formal: 0.9 },
        },
      },
    ])
    mockTable('users', { has_completed_calibration: true })

    const result = await shouldShowOutfitCalibration()
    expect(result).toBe(false)
  })

  it('returns true when at least one valid outfit can be generated', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_style_seed_items', [
      {
        wardrobe_items: {
          id: 'tee-1', display_name: 'Tee', image_url: null,
          layer_role: 'base_layer', style_tags: { minimal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'chino-1', display_name: 'Chinos', image_url: null,
          layer_role: 'bottom', style_tags: { minimal: 0.7 },
        },
      },
      {
        wardrobe_items: {
          id: 'sneaker-1', display_name: 'Sneakers', image_url: null,
          layer_role: 'footwear', style_tags: { minimal: 0.8 },
        },
      },
    ])
    mockTable('users', { has_completed_calibration: false })

    const result = await shouldShowOutfitCalibration()
    expect(result).toBe(true)
  })

  it('returns true for two dresses and two footwear options', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_style_seed_items', [
      { wardrobe_items: { id: 'dress-1', display_name: 'Dress 1', category: 'one_piece', layer_role: 'one_piece', style_tags: { minimal: 0.9 } } },
      { wardrobe_items: { id: 'dress-2', display_name: 'Dress 2', category: 'one_piece', layer_role: 'one_piece', style_tags: { formal: 0.8 } } },
      { wardrobe_items: { id: 'shoe-1', display_name: 'Shoes 1', category: 'footwear', layer_role: 'footwear', style_tags: { minimal: 0.8 } } },
      { wardrobe_items: { id: 'shoe-2', display_name: 'Shoes 2', category: 'footwear', layer_role: 'footwear', style_tags: { formal: 0.8 } } },
    ])
    mockTable('users', { has_completed_calibration: false, timezone: 'UTC' })
    expect(await shouldShowOutfitCalibration()).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// getCalibrationOutfits
// ---------------------------------------------------------------------------

describe('getCalibrationOutfits', () => {
  it('creates calibration outfits from two dresses and two footwear options', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_style_seed_items', [
      { wardrobe_items: { id: 'dress-1', display_name: 'Dress 1', category: 'one_piece', layer_role: 'one_piece', style_tags: { minimal: 0.9 } } },
      { wardrobe_items: { id: 'dress-2', display_name: 'Dress 2', category: 'one_piece', layer_role: 'one_piece', style_tags: { formal: 0.8 } } },
      { wardrobe_items: { id: 'shoe-1', display_name: 'Shoes 1', category: 'footwear', layer_role: 'footwear', style_tags: { minimal: 0.8 } } },
      { wardrobe_items: { id: 'shoe-2', display_name: 'Shoes 2', category: 'footwear', layer_role: 'footwear', style_tags: { formal: 0.8 } } },
    ])
    mockTable('users', { has_completed_calibration: false, timezone: 'UTC' })

    const result = await getCalibrationOutfits()
    expect(result).toHaveLength(3)
    expect(result.every((look) => look.items.some((piece) => piece.layer_role === 'one_piece'))).toBe(true)
  })

  it('returns up to three calibration outfits when the wardrobe can support them', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_style_seed_items', [
      {
        wardrobe_items: {
          id: 'tee-1', display_name: 'Tee', image_url: null,
          layer_role: 'base_layer', style_tags: { minimal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'tee-2', display_name: 'Button-up', image_url: null,
          layer_role: 'base_layer', style_tags: { formal: 0.8 },
        },
      },
      {
        wardrobe_items: {
          id: 'chino-1', display_name: 'Chinos', image_url: null,
          layer_role: 'bottom', style_tags: { minimal: 0.7 },
        },
      },
      {
        wardrobe_items: {
          id: 'trouser-1', display_name: 'Trousers', image_url: null,
          layer_role: 'bottom', style_tags: { formal: 0.9 },
        },
      },
      {
        wardrobe_items: {
          id: 'sneaker-1', display_name: 'Sneakers', image_url: null,
          layer_role: 'footwear', style_tags: { minimal: 0.8 },
        },
      },
      {
        wardrobe_items: {
          id: 'boot-1', display_name: 'Boots', image_url: null,
          layer_role: 'footwear', style_tags: { formal: 0.8 },
        },
      },
    ])
    mockTable('users', { has_completed_calibration: false })
    mockTable('outfits', { id: 'outfit-1' })

    const result = await getCalibrationOutfits()

    expect(result).toHaveLength(3)
    expect(rpcCalls).toHaveLength(3)
  })
})


  it('uses style seeds for calibration even when the owned wardrobe is empty', async () => {
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_style_seed_items', [])
    mockTable('user_style_seed_items', [
      { wardrobe_items: { id: 'dress-seed', display_name: 'Seed Dress', category: 'one_piece', layer_role: 'one_piece', style_tags: { minimal: 0.9 } } },
      { wardrobe_items: { id: 'shoe-seed', display_name: 'Seed Shoes', category: 'footwear', layer_role: 'footwear', style_tags: { minimal: 0.8 } } },
    ])
    mockTable('users', { has_completed_calibration: false })

    const result = await getCalibrationOutfits()

    expect(result).toHaveLength(1)
    expect(rpcCalls).toEqual([
      expect.objectContaining({
        name: 'create_calibration_outfit_with_items',
        payload: expect.objectContaining({
          p_item_ids: ['dress-seed', 'shoe-seed'],
          p_context_snapshot: { relationship: 'style_seed' },
        }),
      }),
    ])
  })

// ---------------------------------------------------------------------------
// skipOutfitCalibration
// ---------------------------------------------------------------------------

describe('skipOutfitCalibration', () => {
  it('updates has_completed_calibration to true on the users table', async () => {
    mockAuthenticatedUser()
    mockTable('users', { id: TEST_USER_ID, has_completed_calibration: true })

    const result = await skipOutfitCalibration()
    expect(result).toEqual({ success: true })

    expect(mockSupabase.from).toHaveBeenCalledWith('users')
  })
})

// ---------------------------------------------------------------------------
// submitOutfitFeedback — server-side re-fetch
// ---------------------------------------------------------------------------

describe('submitOutfitFeedback', () => {
  it('passes the interaction key to the authenticated RPC and uses its server-computed vector', async () => {
    mockAuthenticatedUser()
    rpcResponse = { data: [{ vector: { minimal: 0.55 }, changed_tags: ['minimal'], version: 1 }], error: null }
    const result = await submitOutfitFeedback('outfit-xyz', true, 'interaction-1')
    expect(result).toEqual({ vector: { minimal: 0.55 }, changedTags: ['minimal'] })
    expect(rpcCalls).toEqual([{ name: 'submit_outfit_feedback', payload: {
      p_outfit_id: 'outfit-xyz', p_liked: true, p_feedback_source: 'daily', p_idempotency_key: 'interaction-1',
    } }])
    expect(insertCalls.feedback).toBeUndefined()
    expect(updateCalls.fashion_dna).toBeUndefined()
  })

  it('rejects a missing key before writing', async () => {
    mockAuthenticatedUser()
    await expect(submitOutfitFeedback('outfit-xyz', true, '')).rejects.toThrow('Invalid idempotency key')
    expect(rpcCalls).toHaveLength(0)
  })

  it('surfaces transactional RPC errors without direct writes', async () => {
    mockAuthenticatedUser()
    rpcResponse = { data: null, error: { message: 'Outfit not found' } }
    await expect(submitOutfitFeedback('foreign-outfit', true, 'interaction-2')).rejects.toThrow('Outfit not found')
    expect(insertCalls.feedback).toBeUndefined()
    expect(updateCalls.fashion_dna).toBeUndefined()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('queued daily AI integration', () => {
  const wardrobe = [
    { id: 'tee', display_name: 'Tee', image_url: null, layer_role: 'base_layer', style_tags: { minimal: 0.9 } },
    { id: 'pants', display_name: 'Pants', image_url: null, layer_role: 'bottom', style_tags: { minimal: 0.8 } },
    { id: 'shoes', display_name: 'Shoes', image_url: null, layer_role: 'footwear', style_tags: { minimal: 0.7 } },
  ]

  beforeEach(() => {
    vi.stubEnv('ENABLE_AI_DAILY_OUTFITS', 'true')
    mockAuthenticatedUser()
    mockTable('fashion_dna', { vector: DNA })
    mockTable('user_wardrobe_items', wardrobe.map((wardrobe_items) => ({ wardrobe_items })))
    mockTableSequence('outfits', [{ data: null }, { data: [] }])
    vi.stubGlobal('fetch', vi.fn())
  })

  it('queues once and returns a deterministic outfit without a synchronous provider call', async () => {
    const result = await getDailyOutfit()
    expect(result?.id).toBe('saved')
    expect(outfitEngine.recommendOutfits).toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
    expect(rpcCalls).toEqual([
      { name: 'enqueue_daily_outfit_job', payload: undefined },
      expect.objectContaining({ name: 'create_outfit_with_items', payload: expect.objectContaining({
        p_source: 'engine', p_item_ids: ['tee', 'pants', 'shoes'],
        p_context_snapshot: { ai_job_id: 'saved', fallback_reason: 'ai_queued' },
      }) }),
    ])
  })

  it('uses a stored AI outfit without enqueueing', async () => {
    mockTableSequence('outfits', [{ data: { id: 'cached', item_ids: ['tee', 'pants', 'shoes'], reasoning: ['Good fit'], source: 'daily_ai' } }])
    expect((await getDailyOutfit())?.id).toBe('cached')
    expect(fetch).not.toHaveBeenCalled()
    expect(rpcCalls).toHaveLength(0)
  })

  it('uses the engine when enqueue fails', async () => {
    mockSupabase.rpc.mockResolvedValueOnce({ data: null, error: { message: 'queue unavailable' } })
    await expect(getDailyOutfit()).resolves.toMatchObject({ id: 'saved' })
    expect(fetch).not.toHaveBeenCalled()
    expect(mockSupabase.rpc).toHaveBeenNthCalledWith(1, 'enqueue_daily_outfit_job')
    expect(rpcCalls[0]).toMatchObject({ name: 'create_outfit_with_items', payload: expect.objectContaining({ p_source: 'engine' }) })
  })

  it('does not queue when disabled', async () => {
    vi.stubEnv('ENABLE_AI_DAILY_OUTFITS', 'false')
    mockTableSequence('outfits', [{ data: [] }])
    await getDailyOutfit()
    expect(rpcCalls.map((call) => call.name)).toEqual(['create_outfit_with_items'])
    expect(fetch).not.toHaveBeenCalled()
  })
})
