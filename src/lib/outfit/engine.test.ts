/**
 * Unit tests for src/lib/outfit/engine.ts
 *
 * Run with:  npx vitest run src/lib/outfit/engine.test.ts
 *       or:  npx jest src/lib/outfit/engine.test.ts
 */

import { describe, it, expect } from 'vitest'
import {
  recommendOutfits,
  isValidOutfitStructure,
  scoreItem,
  scoreOutfit,
  type WardrobeItem,
} from './engine'
import type { StyleVector } from '@/src/lib/quiz/scoring'
import { normalizeWardrobeItem } from '@/src/lib/wardrobe/normalize'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DNA: StyleVector = {
  minimal: 0.8,
  streetwear: 0.2,
  formal: 0.1,
  bohemian: 0.0,
  edgy: 0.05,
  earth_tones: 0.3,
}

function item(
  id: string,
  layer_role: WardrobeItem['layer_role'],
  style_tags: Partial<StyleVector>,
): WardrobeItem {
  return { id, display_name: id, image_url: null, layer_role, style_tags }
}

/** 10-item wardrobe covering all required and optional slots */
const WARDROBE: WardrobeItem[] = [
  // base layers (3)
  item('tee-white',    'base_layer', { minimal: 0.9, earth_tones: 0.2 }),
  item('tee-graphic',  'base_layer', { streetwear: 0.8, edgy: 0.4 }),
  item('shirt-oxford', 'base_layer', { formal: 0.9, minimal: 0.5 }),

  // bottoms (3)
  item('chino-tan',   'bottom', { minimal: 0.7, earth_tones: 0.8 }),
  item('jeans-slim',  'bottom', { streetwear: 0.6, minimal: 0.4 }),
  item('trousers',    'bottom', { formal: 0.85, minimal: 0.6 }),

  // footwear (2)
  item('sneaker-white', 'footwear', { minimal: 0.9, streetwear: 0.5 }),
  item('derby-black',   'footwear', { formal: 0.9, minimal: 0.4 }),

  // outerwear (1 optional)
  item('bomber',     'outerwear', { streetwear: 0.7, edgy: 0.3 }),

  // accessory (1 optional)
  item('leather-belt', 'accessory', { minimal: 0.6, earth_tones: 0.4 }),
]

// ---------------------------------------------------------------------------
// scoreItem
// ---------------------------------------------------------------------------

describe('scoreItem', () => {
  it('returns 0 for a zero DNA vector', () => {
    const zeroDna: StyleVector = { minimal: 0, streetwear: 0, formal: 0, bohemian: 0, edgy: 0, earth_tones: 0 }
    expect(scoreItem(WARDROBE[0], zeroDna)).toBe(0)
  })

  it('returns 0 for an item with empty style_tags', () => {
    const empty = item('empty', 'base_layer', {})
    expect(scoreItem(empty, DNA)).toBe(0)
  })

  it('returns 1 for a perfect alignment', () => {
    const perfectDna: StyleVector = { minimal: 1 }
    const perfectItem = item('p', 'base_layer', { minimal: 1 })
    expect(scoreItem(perfectItem, perfectDna)).toBeCloseTo(1, 5)
  })

  it('returns value in [0, 1] for all wardrobe items', () => {
    for (const i of WARDROBE) {
      const s = scoreItem(i, DNA)
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------
// scoreOutfit
// ---------------------------------------------------------------------------

describe('scoreOutfit', () => {
  it('returns 0 for an empty item list', () => {
    expect(scoreOutfit([], DNA)).toBe(0)
  })

  it('returns a value in [0, 1]', () => {
    const s = scoreOutfit(WARDROBE.slice(0, 3), DNA)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThanOrEqual(1)
  })

  it('rounds to 4 decimal places', () => {
    const s = scoreOutfit(WARDROBE.slice(0, 3), DNA)
    expect(s).toBe(Math.round(s * 10_000) / 10_000)
  })
})

// ---------------------------------------------------------------------------
// recommendOutfits — acceptance criteria
// ---------------------------------------------------------------------------

describe('recommendOutfits', () => {
  it('returns exactly 5 outfits for a wardrobe with 10 items', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    expect(results).toHaveLength(5)
  })

  it('each outfit has at least 3 items (base + bottom + footwear)', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    for (const outfit of results) {
      expect(outfit.items.length).toBeGreaterThanOrEqual(3)
    }
  })

  it('each outfit contains exactly one base_layer', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    for (const outfit of results) {
      const count = outfit.items.filter((i) => i.layer_role === 'base_layer').length
      expect(count).toBe(1)
    }
  })

  it('each outfit contains exactly one bottom', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    for (const outfit of results) {
      const count = outfit.items.filter((i) => i.layer_role === 'bottom').length
      expect(count).toBe(1)
    }
  })

  it('each outfit contains exactly one footwear', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    for (const outfit of results) {
      const count = outfit.items.filter((i) => i.layer_role === 'footwear').length
      expect(count).toBe(1)
    }
  })

  it('each outfit contains at most one outerwear', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    for (const outfit of results) {
      const count = outfit.items.filter((i) => i.layer_role === 'outerwear').length
      expect(count).toBeLessThanOrEqual(1)
    }
  })

  it('each outfit contains at most one accessory', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    for (const outfit of results) {
      const count = outfit.items.filter((i) => i.layer_role === 'accessory').length
      expect(count).toBeLessThanOrEqual(1)
    }
  })

  it('all 5 outfits are distinct (no duplicate item sets)', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    const keys = results.map((o) =>
      o.items.map((i) => i.id).sort().join('|'),
    )
    const unique = new Set(keys)
    expect(unique.size).toBe(results.length)
  })

  it('outfits are sorted by score descending', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score)
    }
  })

  it('each score is a number in [0, 1]', () => {
    const results = recommendOutfits(WARDROBE, DNA)
    for (const outfit of results) {
      expect(typeof outfit.score).toBe('number')
      expect(outfit.score).toBeGreaterThanOrEqual(0)
      expect(outfit.score).toBeLessThanOrEqual(1)
    }
  })

  it('ignores items with unrecognised layer_role', () => {
    const withBad = [
      ...WARDROBE,
      { ...item('unknown-role', 'base_layer', { minimal: 1 }), layer_role: 'handbag' as WardrobeItem['layer_role'] },
    ]
    // Should not throw and still return 5 outfits
    expect(() => recommendOutfits(withBad, DNA)).not.toThrow()
    expect(recommendOutfits(withBad, DNA)).toHaveLength(5)
  })

  it('respects topN option', () => {
    expect(recommendOutfits(WARDROBE, DNA, { topN: 3 })).toHaveLength(3)
    expect(recommendOutfits(WARDROBE, DNA, { topN: 1 })).toHaveLength(1)
  })

  it('returns fewer than topN when not enough valid combinations exist', () => {
    // Only 1 base + 1 bottom + 1 footwear → exactly 1 valid outfit
    const tiny: WardrobeItem[] = [
      item('b', 'base_layer', { minimal: 0.8 }),
      item('p', 'bottom',     { minimal: 0.7 }),
      item('s', 'footwear',   { minimal: 0.9 }),
    ]
    const results = recommendOutfits(tiny, DNA)
    expect(results).toHaveLength(1)
  })

  it('returns empty array when a required slot is missing', () => {
    // No footwear → no valid outfits
    const noShoes = WARDROBE.filter((i) => i.layer_role !== 'footwear')
    expect(recommendOutfits(noShoes, DNA)).toHaveLength(0)
  })
})


describe('normalized wardrobe roles', () => {
  it('includes a valid-category item whose stored layer_role is null', () => {
    const raw = { category: 'top', subcategory: 'shirt', display_name: 'Tee', layer_role: null }
    const normalized = normalizeWardrobeItem(raw)
    const results = recommendOutfits([
      item('tee', normalized.layer_role, { minimal: 0.8 }),
      item('pants', 'bottom', { minimal: 0.8 }),
      item('shoes', 'footwear', { minimal: 0.8 }),
    ], DNA, { topN: 1 })
    expect(results).toHaveLength(1)
    expect(results[0].items.map((i) => i.id)).toContain('tee')
  })

  it.each(['dress', 'midi dress', 'jumpsuit', 'romper'])('normalizes %s to one_piece', (name) => {
    expect(normalizeWardrobeItem({ subcategory: name })).toEqual({ category: 'one_piece', layer_role: 'one_piece' })
  })

  it('keeps an explicit valid outerwear category over dress-like text', () => {
    expect(normalizeWardrobeItem({ category: 'outerwear', display_name: 'Dress coat' })).toEqual({
      category: 'outerwear', layer_role: 'outerwear',
    })
  })
})

describe('outfit archetypes', () => {
  const shoe = item('shoe', 'footwear', { minimal: 0.8 })
  const dress = item('dress', 'one_piece', { minimal: 0.9 })
  const top = item('top', 'base_layer', { minimal: 0.8 })
  const bottom = item('bottom', 'bottom', { minimal: 0.7 })
  const outer = item('coat', 'outerwear', { minimal: 0.7 })
  const accessory = item('bag', 'accessory', { minimal: 0.6 })

  it('accepts separates with footwear', () => {
    expect(isValidOutfitStructure([top, bottom, shoe])).toBe(true)
  })

  it('accepts a one-piece with footwear', () => {
    expect(isValidOutfitStructure([dress, shoe])).toBe(true)
    expect(recommendOutfits([dress, shoe], DNA, { topN: 1 })[0].items).toEqual([dress, shoe])
  })

  it('accepts one-piece optional outerwear and accessory', () => {
    expect(isValidOutfitStructure([dress, shoe, outer, accessory])).toBe(true)
  })

  it('rejects incomplete and mixed cores', () => {
    expect(isValidOutfitStructure([dress])).toBe(false)
    expect(isValidOutfitStructure([dress, shoe, bottom])).toBe(false)
    expect(isValidOutfitStructure([top, bottom])).toBe(false)
  })

  it('ranks candidates from both archetypes together', () => {
    const results = recommendOutfits([top, bottom, dress, shoe], DNA, { topN: 10 })
    expect(results.some((look) => look.items.some((piece) => piece.layer_role === 'one_piece'))).toBe(true)
    expect(results.some((look) => look.items.some((piece) => piece.layer_role === 'base_layer'))).toBe(true)
  })

  it('preserves deterministic ordering', () => {
    const wardrobe = [top, bottom, dress, shoe, outer, accessory]
    expect(recommendOutfits(wardrobe, DNA, { topN: 10 })).toEqual(recommendOutfits(wardrobe, DNA, { topN: 10 }))
  })
})

describe('anchored outfit recommendations', () => {
  it.each(['base_layer', 'bottom', 'footwear', 'outerwear', 'accessory'] as const)('requires a %s anchor without changing score calculation', (role) => {
    const anchor = WARDROBE.find((piece) => piece.layer_role === role)!
    const ranked = recommendOutfits(WARDROBE, DNA, { topN: 3, anchorItemId: anchor.id })
    const exhaustive = recommendOutfits(WARDROBE, DNA, { topN: 10000 }).filter((look) => look.items.some((piece) => piece.id === anchor.id)).slice(0, 3)
    expect(ranked.map((look) => look.score)).toEqual(exhaustive.map((look) => look.score))
    expect(ranked.length).toBeGreaterThan(0)
    for (const look of ranked) {
      expect(look.items.filter((piece) => piece.id === anchor.id)).toHaveLength(1)
      expect(look.score).toBe(scoreOutfit(look.items, DNA))
      expect(look.items.filter((piece) => piece.layer_role === role)).toHaveLength(1)
    }
  })

  it('retains a low-ranked anchor before per-role candidate bounding', () => {
    const anchor = item('least-preferred', 'base_layer', { bohemian: 1 })
    const pool = [...WARDROBE, anchor]
    const result = recommendOutfits(pool, DNA, { topN: 1, anchorItemId: anchor.id })
    expect(result).toHaveLength(1)
    expect(result[0].items.some((piece) => piece.id === anchor.id)).toBe(true)
  })

  it.each(['missing', ''])('never returns unanchored ideas for missing anchor %s', (anchorItemId) => {
    expect(recommendOutfits(WARDROBE, DNA, { anchorItemId })).toEqual([])
  })

  it('keeps required-role validity for optional anchors', () => {
    const anchor = WARDROBE.find((piece) => piece.layer_role === 'accessory')!
    expect(recommendOutfits(WARDROBE.filter((piece) => piece.layer_role !== 'footwear'), DNA, { anchorItemId: anchor.id })).toEqual([])
  })
})
