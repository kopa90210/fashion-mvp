import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), from: vi.fn(), rpc: vi.fn(), signed: vi.fn(),
}))

let tableResponses: Record<string, { data: unknown; error: unknown }> = {}

function query(table: string) {
  const response = () => tableResponses[table] ?? { data: null, error: null }
  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), is: vi.fn().mockReturnThis(),
    single: vi.fn().mockImplementation(() => response()),
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(response())
  return builder
}

vi.mock('@/src/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.auth }, from: mocks.from, rpc: mocks.rpc }),
}))
vi.mock('@/src/lib/media/private-media', () => ({ signedOwnedPrivateUrl: mocks.signed }))
vi.mock('@/src/lib/outfit/engine', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/src/lib/outfit/engine')>()
  return { ...original, scoreOutfit: vi.fn(original.scoreOutfit) }
})

import { createSwappedOutfit, getSwapCandidates } from './outfit-swaps'
import { scoreOutfit } from '@/src/lib/outfit/engine'

const userId = '10000000-0000-0000-0000-000000000001'
const outfitId = '20000000-0000-0000-0000-000000000001'
const topId = '30000000-0000-0000-0000-000000000001'
const bottomId = '30000000-0000-0000-0000-000000000002'
const shoeId = '30000000-0000-0000-0000-000000000003'
const replacementA = '30000000-0000-0000-0000-000000000004'
const replacementB = '30000000-0000-0000-0000-000000000005'
const draftReplacement = '30000000-0000-0000-0000-000000000006'
const retiredReplacement = '30000000-0000-0000-0000-000000000007'
const foreignReplacement = '30000000-0000-0000-0000-000000000008'

function owned(id: string, category: string, style: number, options: { status?: string; retiredAt?: string | null; owner?: string; media?: string | null } = {}) {
  return {
    user_id: options.owner ?? userId,
    retired_at: options.retiredAt ?? null,
    wardrobe_items: {
      id, display_name: id, image_url: `/images/${id}.png`, media_asset_id: options.media ?? null,
      status: options.status ?? 'confirmed', category, subcategory: null,
      layer_role: category === 'top' ? 'base_layer' : category,
      style_tags: { minimal: style },
    },
  }
}

function configureValidData() {
  tableResponses.outfits = { data: { id: outfitId, outfit_items: [
    { wardrobe_item_id: topId, slot: 'base_layer', position: 0 },
    { wardrobe_item_id: bottomId, slot: 'bottom', position: 1 },
    { wardrobe_item_id: shoeId, slot: 'footwear', position: 2 },
  ] }, error: null }
  tableResponses.fashion_dna = { data: { vector: { minimal: 1 } }, error: null }
  tableResponses.user_wardrobe_items = { data: [
    owned(topId, 'top', 0.4), owned(bottomId, 'bottom', 0.5), owned(shoeId, 'footwear', 0.6),
    owned(replacementA, 'top', 1, { media: 'replacement-a-media' }),
    owned(replacementB, 'top', 0.7),
    owned(draftReplacement, 'top', 1, { status: 'draft' }),
    owned(retiredReplacement, 'top', 1, { retiredAt: '2026-10-01T00:00:00Z' }),
    owned(foreignReplacement, 'top', 1, { owner: '10000000-0000-0000-0000-000000000002' }),
  ], error: null }
}

beforeEach(() => {
  vi.clearAllMocks()
  tableResponses = {}
  mocks.auth.mockResolvedValue({ data: { user: { id: userId } }, error: null })
  mocks.from.mockImplementation(query)
  mocks.rpc.mockResolvedValue({ data: '40000000-0000-0000-0000-000000000001', error: null })
  mocks.signed.mockImplementation(async (_client: unknown, id: string) => `https://signed.test/${id}`)
  configureValidData()
})

describe('getSwapCandidates', () => {
  it('scores complete same-role replacements deterministically and excludes the original item', async () => {
    const candidates = await getSwapCandidates(outfitId, topId)
    expect(candidates.map((candidate) => candidate.replacement.id)).toEqual([replacementA, replacementB])
    expect(candidates.every((candidate) => candidate.replacement.layer_role === 'base_layer')).toBe(true)
    expect(candidates.some((candidate) => candidate.replacement.id === topId)).toBe(false)
    expect(scoreOutfit).toHaveBeenCalledTimes(2)
    expect(vi.mocked(scoreOutfit).mock.calls.every(([items]) => items.length === 3 && items.some((item) => item.id === bottomId) && items.some((item) => item.id === shoeId))).toBe(true)
    expect(candidates[0].replacement.image_url).toBe('https://signed.test/replacement-a-media')
    expect(candidates[0]).toMatchObject({ category: 'top', subcategory: null, descriptor: 'Top' })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('returns no draft, retired, or foreign-owned candidates and respects the requested maximum', async () => {
    const candidates = await getSwapCandidates(outfitId, topId, 1)
    expect(candidates).toHaveLength(1)
    expect(candidates.map((candidate) => candidate.replacement.id)).not.toEqual(expect.arrayContaining([
      draftReplacement, retiredReplacement, foreignReplacement,
    ]))
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects foreign or missing outfits without generating candidates', async () => {
    tableResponses.outfits = { data: null, error: { code: 'PGRST116' } }
    await expect(getSwapCandidates(outfitId, topId)).rejects.toThrow('Outfit not found')
    expect(scoreOutfit).not.toHaveBeenCalled()
  })

  it('rejects a selected item that is not part of the parent outfit', async () => {
    await expect(getSwapCandidates(outfitId, replacementA)).rejects.toThrow('Item is not part of outfit')
    expect(scoreOutfit).not.toHaveBeenCalled()
  })

  it('rejects malformed requests and unauthenticated callers before reads', async () => {
    await expect(getSwapCandidates('bad-id', topId)).rejects.toThrow('Invalid outfit')
    await expect(getSwapCandidates(outfitId, topId, 0)).rejects.toThrow('Invalid candidate limit')
    mocks.auth.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getSwapCandidates(outfitId, topId)).rejects.toThrow('Not authenticated')
  })
})

describe('createSwappedOutfit', () => {
  it('delegates persistence to the authenticated atomic RPC', async () => {
    await expect(createSwappedOutfit(outfitId, topId, replacementA, 'swap-key')).resolves.toEqual({
      outfitId: '40000000-0000-0000-0000-000000000001',
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('create_swapped_outfit', {
      p_parent_outfit_id: outfitId,
      p_replaced_item_id: topId,
      p_replacement_item_id: replacementA,
      p_idempotency_key: 'swap-key',
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects bad keys locally and does not leak RPC errors', async () => {
    await expect(createSwappedOutfit(outfitId, topId, replacementA, ' ')).rejects.toThrow('Invalid idempotency key')
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private ownership details' } })
    await expect(createSwappedOutfit(outfitId, topId, replacementA, 'swap-key')).rejects.toThrow('Could not create swapped outfit')
  })
})
