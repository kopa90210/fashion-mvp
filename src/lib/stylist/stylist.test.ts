import { describe, expect, it, vi } from 'vitest'
import type { WardrobeItem } from '@/src/lib/outfit/engine'
import { readCatalog, searchCatalog } from './catalog'
import { classifyWithGemini } from './gemini'
import { explicitBudget, fallbackIntent, resolveIntent, type Intent } from './intent'
import { recommendations } from './recommend'

const now = Date.parse('2026-11-19T08:00:00Z')
const row = {
  id: 'chino', title: 'Beige chinos', url: 'https://www.lcwaikiki.eg/en/sample-chinos',
  priceEgp: 899, currency: 'EGP', stock: 'in_stock', collection: 'masculine', role: 'bottom',
  occasions: ['work', 'everyday'], checkedAt: '2026-11-19T06:00:00Z', styleTags: { classic: 0.9 },
}
const catalog = readCatalog(JSON.stringify([row]), now)
const item = (id: string, role: WardrobeItem['layer_role']): WardrobeItem =>
  ({ id, layer_role: role, display_name: id, image_url: null, style_tags: { classic: 1 } })
const ctx = {
  dna: { classic: 1 }, signals: null,
  items: [item('Oxford', 'base_layer'), item('Navy tee', 'base_layer'), item('Loafers', 'footwear'), item('Denim', 'bottom')],
}
const shop: Intent = { mode: 'shop', role: 'bottom', occasion: 'work', budget: 1500 }

describe('stylist behavior evaluation', () => {
  it.each([
    ['عايز أشتري بنطلون للشغل تحت ١٥٠٠ جنيه', 1499],
    ['Work chinos under 1,500 EGP', 1499],
    ['بنطلون لحد ١٬٥٠٠ جنيه', 1500],
    ['under 899.50 EGP', 899],
    ['بنطلون تحت ٨٩٩٫٥٠ جنيه', 899],
    ['بنطلون تحت ۱۵۰۰ جنيه', 1499],
    ['under 1 EGP', 0],
  ])('respects written budget: %s', (question, amount) => {
    expect(explicitBudget(question)).toBe(amount)
  })
  it('keeps Arabic wardrobe requests out of shopping despite model misclassification', () => {
    expect(resolveIntent('ألبس إيه للشغل من دولابي؟', shop).mode).toBe('restyle')
    expect(fallbackIntent('نسّق لي خروجة من هدومي').occasion).toBe('going-out')
  })
  it('honors explicit shopping and no-buy requests even when the model disagrees', () => {
    expect(resolveIntent('I want to buy work trousers', { ...shop, mode: 'restyle' }).mode).toBe('shop')
    expect(resolveIntent("Style an outfit without buying anything", shop).mode).toBe('restyle')
  })
  it('keeps a model from raising an explicit cap', () => {
    expect(resolveIntent('chinos under 800', shop).budget).toBe(799)
  })
  it('rejects stale, unverified, non-EGP, foreign URLs, and duplicates', () => {
    const variants = [
      { stock: 'unknown' }, { currency: 'USD' }, { url: 'https://www.lcwaikiki.eg.bad.example/p' },
      { url: 'https://www.defacto.com.eg/redirect?next=example' }, { checkedAt: '2026-11-16T00:00:00Z' },
      { checkedAt: '2026-11-20T00:00:00Z' },
    ]
    const rejected = variants.map((change, i) => ({ ...row, id: 'bad' + i, ...change }))
    expect(readCatalog(JSON.stringify([...rejected, row, { ...row, id: 'duplicate-link' }]), now)).toEqual(catalog)
    expect(catalog).toHaveLength(1)
  })
  it('filters by collection, EGP limit, and occasion', () => {
    expect(searchCatalog(catalog, shop, 'masculine')).toHaveLength(1)
    expect(searchCatalog(catalog, shop, 'feminine')).toEqual([])
    expect(searchCatalog(catalog, { ...shop, budget: 800 }, 'masculine')).toEqual([])
    expect(searchCatalog(catalog, { ...shop, occasion: 'going-out' }, 'masculine')).toEqual([])
  })
  it('returns owned restyling without displaying a purchase', () => {
    const result = recommendations(ctx, catalog, { ...shop, mode: 'restyle' }, 'masculine')
    expect(result.status).toBe('restyle')
    expect(result.looks[0].pieces.every((piece) => piece.owned)).toBe(true)
    expect(result.suggestion).toBeUndefined()
  })
  it('grounds two different outfit examples in owned pieces and one indexed product', () => {
    const result = recommendations(ctx, catalog, shop, 'masculine')
    expect(result.status).toBe('shop')
    const suggestion = result.suggestion!
    expect(suggestion.product.url).toBe(row.url)
    expect(suggestion.looks).toHaveLength(2)
    const ownedSets = suggestion.looks.map(l => l.pieces.filter(p => p.owned).map(p => p.name).sort().join('|'))
    expect(new Set(ownedSets).size).toBe(2)
    expect(suggestion.looks.every(l => l.pieces.filter(p => !p.owned).map(p => p.name).join() === row.title)).toBe(true)
  })
  it('avoids redundant purchase and rejects candidates without two complete looks', () => {
    const similar = { ...ctx, items: [...ctx.items, item('beige-chinos', 'bottom')] }
    const sparse = { ...ctx, items: ctx.items.filter(i => i.id !== 'Navy tee') }
    expect(recommendations(similar, catalog, shop, 'masculine').suggestion).toBeUndefined()
    expect(recommendations(sparse, catalog, shop, 'masculine').status).toBe('no-match')
  })
  it('daily mode allows owned-only and shows an optional addition with budget', () => {
    expect(recommendations(ctx, catalog, { ...shop, budget: null }, 'masculine', true).status).toBe('restyle')
    expect(recommendations(ctx, catalog, shop, 'masculine', true).suggestion?.product.id).toBe('chino')
  })
  it('asks for an explicit budget or category and handles empty wardrobe', () => {
    expect(recommendations(ctx, catalog, { ...shop, budget: null }, 'masculine').clarification).toBe('budget')
    expect(recommendations(ctx, catalog, { ...shop, role: null }, 'masculine').clarification).toBe('category')
    expect(recommendations({ ...ctx, items: [] }, catalog, shop, 'masculine').status).toBe('empty')
  })
})

describe('Gemini provider contract', () => {
  it('sends only the prompt through the request and validates structured output', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ candidates: [
      { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ ...shop, url: 'https://bogus.example' }) }] } },
    ] }))
    expect(await classifyWithGemini('Find work trousers', { model: 'gemini-3.1-flash-lite', key: 'test-only', fetcher })).toEqual(shop)
    const [endpoint, request] = fetcher.mock.calls[0]
    expect(String(endpoint)).not.toContain('test-only')
    expect(JSON.parse(String(request?.body)).contents[0].parts).toEqual([{ text: 'Find work trousers' }])
  })
  it('returns no model intent on service failures, incomplete replies, or malformed data', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 429 }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'MAX_TOKENS' }] }))
      .mockResolvedValueOnce(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"mode":"buy_anything"}' }] } }] }))
    const options = { model: 'gemini-3.1-flash-lite', key: 'test-only', fetcher }
    for (let i = 0; i < 3; i++) expect(await classifyWithGemini('question', options)).toBeNull()
  })
})
