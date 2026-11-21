import { describe, expect, it } from 'vitest'
import { recommendOutfits, type WardrobeItem } from '@/src/lib/outfit/engine'
import { analyzeNeeds, dailyOccasion } from './daily-needs'
import type { Product } from './catalog'
import type { Intent } from './intent'
import { recommendations } from './recommend'

const piece = (id: string, layer_role: WardrobeItem['layer_role']): WardrobeItem =>
  ({ id, display_name: id, layer_role, image_url: null, style_tags: {} })
const separates = [piece('oxford', 'base_layer'), piece('tee', 'base_layer'), piece('jeans', 'bottom')]
const wardrobe = [...separates, piece('sneakers', 'footwear')]
const goodOffer: Product = {
  id: 'loafers', title: 'Loafers', role: 'footwear', priceEgp: 900, brand: 'Concrete',
  url: 'https://concrete.store/products/test-loafers', checkedAt: '2026-11-21T00:00:00Z',
  collection: 'masculine', occasions: ['work'], styleTags: {},
}
const intent: Intent = { mode: 'shop', occasion: 'work', budget: 1000, role: null }
const context = (items: WardrobeItem[]) => ({ items, dna: {}, signals: null })
const now = Date.parse('2026-11-21T21:00:00Z')

describe('Daily Finds', () => {
  it('identifies the one missing piece that can complete the first two looks', () => {
    const result = recommendations(context(separates), [goodOffer], intent, 'masculine', true, now)
    const need = { role: 'footwear', kind: 'missing', possibleNewCombinations: 2 }
    expect(result.daily?.gaps).toEqual([need])
    expect(result.looks).toEqual([])
    expect(result.suggestion).toMatchObject({ product: { id: 'loafers' }, need })
    expect(result.suggestion?.looks.map(look => look.pieces.filter(item => item.owned).map(item => item.name)))
      .toEqual([['oxford', 'jeans'], ['tee', 'jeans']])
  })

  it('explains multiple missing building blocks without selling one as a complete solution', () => {
    const result = recommendations(context(separates.slice(0, 2)), [goodOffer], intent, 'masculine', true, now)
    expect(result.status).toBe('no-match')
    expect(result.daily?.gaps.map(({ role, kind }) => [role, kind]))
      .toEqual([['footwear', 'building-block'], ['bottom', 'building-block']])
    expect(result.suggestion).toBeUndefined()
  })

  it('treats a dress as an alternate valid path and skips an offer with only one possible outfit', () => {
    const dress = piece('dress', 'one_piece')
    expect(analyzeNeeds([dress], 'feminine')).toEqual([
      { role: 'footwear', kind: 'missing', possibleNewCombinations: 1 },
    ])
    const result = recommendations(context([dress]), [{ ...goodOffer, collection: 'shared' }], intent, 'feminine', true, now)
    expect(result.suggestion).toBeUndefined()
    expect(analyzeNeeds(wardrobe, 'feminine').some(need => need.role === 'one_piece')).toBe(false)
  })

  it('prefers a better-supported role over a cheaper offer in another role', () => {
    const cheaperTop: Product = { ...goodOffer, id: 'shirt', title: 'Shirt', role: 'base_layer', priceEgp: 200 }
    const items = [...wardrobe, piece('chinos', 'bottom')]
    const result = recommendations(context(items), [cheaperTop, goodOffer], intent, 'masculine', true, now)
    expect(result.suggestion?.product.id).toBe('loafers')
    expect(result.suggestion?.need).toEqual({ role: 'footwear', kind: 'variety', possibleNewCombinations: 4 })
  })

  it('keeps the daily look stable until Cairo midnight and rotates when there is another look', () => {
    const daily = (at: string) => recommendations(context(wardrobe), [], { ...intent, budget: null }, 'masculine', true, Date.parse(at))
    const before = daily('2026-11-21T21:00:00Z')
    expect(before.daily?.date).toBe('2026-11-21')
    expect(daily('2026-11-21T21:59:59Z')).toEqual(before)
    const after = daily('2026-11-21T22:00:00Z')
    expect(after.daily?.date).toBe('2026-11-22')
    expect(after.looks).not.toEqual(before.looks)
    expect(after.suggestion).toBeUndefined()
  })

  it('uses the chosen occasion for product search and never shops without a budget', () => {
    expect(dailyOccasion(null)).toBe('everyday')
    expect(dailyOccasion(null, 'going-out')).toBe('going-out')
    for (const change of [{ occasion: 'going-out' as const }, { budget: null }, { budget: 899 }]) {
      const result = recommendations(context(wardrobe), [goodOffer], { ...intent, ...change }, 'masculine', true, now)
      expect(result.status).toBe('restyle')
      expect(result.suggestion).toBeUndefined()
      expect(result.daily?.gaps.length).toBeGreaterThan(0)
    }
  })

  it('uses item formality to rank occasions even without a completed style quiz', () => {
    const items = [{ ...wardrobe[0], formality_score: 0.6 }, { ...wardrobe[1], formality_score: 0.2 }, ...wardrobe.slice(2)]
    expect(recommendOutfits(items, {}, { topN: 1, occasion: 'work-university' })[0].items[0].id).toBe('oxford')
    expect(recommendOutfits(items, {}, { topN: 1, occasion: 'everyday-errands' })[0].items[0].id).toBe('tee')
  })
})
