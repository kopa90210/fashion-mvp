import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WardrobeItem } from '@/src/lib/outfit/engine'

const calls = vi.hoisted(() => ({
  getUser: vi.fn(), loadWardrobe: vi.fn(), classify: vi.fn(),
}))
vi.mock('@/src/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: calls.getUser } })),
}))
vi.mock('@/src/lib/stylist/wardrobe', () => ({ loadStylistWardrobe: calls.loadWardrobe }))
vi.mock('@/src/lib/stylist/gemini', () => ({ classifyWithGemini: calls.classify }))

import { POST } from './route'

const piece = (name: string, layer_role: WardrobeItem['layer_role']) => ({
  id: name, display_name: name, layer_role, style_tags: {}, image_url: null,
})
function request(body: object, origin = 'https://style.example') {
  return new Request('https://style.example/api/stylist', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('ENABLE_STYLIST', 'true')
  vi.stubEnv('GEMINI_STYLIST_API_KEY', 'test-only')
  vi.stubEnv('STYLIST_CATALOG_JSON', '')
  vi.stubEnv('STYLIST_PILOT_USER_IDS', 'current-user')
  vi.stubEnv('STYLIST_PILOT_METRICS', 'false')
  calls.getUser.mockResolvedValue({ data: { user: { id: 'current-user' } } })
  calls.loadWardrobe.mockResolvedValue({ items: [
    piece('Oxford', 'base_layer'), piece('Loafers', 'footwear'), piece('Jeans', 'bottom'),
  ], dna: {}, signals: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('stylist HTTP boundary', () => {
  it('handles a same-day Arabic interview as a plan, asking only for a missing budget', async () => {
    calls.loadWardrobe.mockResolvedValue({ items: [
      { ...piece('Oxford', 'base_layer'), formality_score: 0.65 },
      { ...piece('Polo', 'base_layer'), formality_score: 0.45 },
      { ...piece('Trousers', 'bottom'), formality_score: 0.55 },
    ], dna: {}, signals: { style: 'classic', fit: 'regular', formality: 'polished', primaryOccasion: 'everyday-errands', exploration: 'familiar' } })
    vi.stubEnv('STYLIST_CATALOG_JSON', JSON.stringify([{
      id: 'demo', title: 'Demo loafers', url: 'https://concrete.store/products/test-loafers', currency: 'EGP',
      priceEgp: 900, stock: 'in_stock', checkedAt: new Date().toISOString(), role: 'footwear', collection: 'masculine', occasions: ['work'],
    }]))
    const ask = async (question: string) => (await POST(request({ view: 'ask', collection: 'masculine', question }))).json()
    const q = 'عندي انترفيو النهارده، ألبس إيه؟'
    expect(await ask(q)).toMatchObject({
      clarification: 'budget', identity: { style: 'classic', fit: 'regular', formality: 'polished' },
      event: { kind: 'interview', urgent: true, outcome: 'missing-budget', need: { role: 'footwear' } },
    })
    expect(await ask(q + ' ميزانيتي ١٢٠٠ جنيه')).toMatchObject({
      event: { outcome: 'shortlist' }, suggestion: { product: { id: 'demo' }, looks: [expect.any(Object)] },
    })
    expect(await ask(q + ' ميزانيتي ٨٠٠ جنيه')).toMatchObject({ event: { outcome: 'no-offer' } })
    const noBuy = await ask(q + ' من غير ما أشتري، ميزانيتي ١٢٠٠ جنيه')
    expect(noBuy.event.outcome).toBe('gap')
    expect(noBuy.suggestion).toBeUndefined()
    expect(calls.classify).not.toHaveBeenCalled()
  })

  it('prefers an owned outfit even with a budget and flags uncertain wedding formality', async () => {
    calls.loadWardrobe.mockResolvedValue({ items: [
      { ...piece('Oxford', 'base_layer'), formality_score: 0.65 },
      { ...piece('Trousers', 'bottom'), formality_score: 0.55 },
      piece('Loafers', 'footwear'),
    ], dna: {}, signals: null })
    const ask = async (question: string) => (await POST(request({ view: 'ask', collection: 'masculine', question }))).json()
    const interview = await ask('I have an interview today, budget 1200 EGP')
    expect(interview.event.outcome).toBe('owned')
    expect(interview.looks[0].pieces.every((p: { owned: boolean }) => p.owned)).toBe(true)
    expect(interview.suggestion).toBeUndefined()
    expect(await ask('I have a wedding tonight')).toMatchObject({ event: { outcome: 'check-dress-code' } })
  })
  it('uses a daily occasion override without calling Gemini and rejects bad choices', async () => {
    const body = { view: 'daily', collection: 'masculine' }
    const bad = await POST(request({ ...body, occasion: 'anything' }))
    expect(bad.status).toBe(400)
    const valid = await POST(request({ ...body, occasion: 'work' }))
    expect(valid.status).toBe(200)
    expect(await valid.json()).toMatchObject({ daily: { occasion: 'work', gaps: expect.any(Array) } })
    expect(calls.classify).not.toHaveBeenCalled()
  })
  it('keeps a deployed pilot closed without a cohort and rejects non-members before reading their wardrobes', async () => {
    const body = { view: 'ask', collection: 'masculine', question: 'What can I wear?' }
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('STYLIST_PILOT_USER_IDS', undefined)
    expect((await POST(request(body))).status).toBe(404)
    vi.stubEnv('STYLIST_PILOT_USER_IDS', 'another-user')
    expect((await POST(request(body))).status).toBe(404)
    expect(calls.loadWardrobe).not.toHaveBeenCalled()
    expect(calls.classify).not.toHaveBeenCalled()
    vi.stubEnv('STYLIST_PILOT_USER_IDS', 'another-user, current-user')
    expect((await POST(request(body))).status).toBe(200)
  })

  it('takes an Arabic shopping request through catalog validation, budget and outfit matching', async () => {
    const offer = {
      id: 'fixture-chino', title: 'Beige chinos', url: 'https://www.lcwaikiki.eg/en/fixture-chino',
      priceEgp: 899.50, currency: 'EGP', stock: 'in_stock',
      checkedAt: new Date().toISOString(), collection: 'masculine', role: 'bottom', occasions: ['work'],
    }
    vi.stubEnv('STYLIST_CATALOG_JSON', JSON.stringify([
      offer, { ...offer, id: 'stale', url: 'https://www.defacto.com.eg/fixture-stale', priceEgp: 400, checkedAt: '2024-01-01T00:00:00Z' },
    ]))
    calls.loadWardrobe.mockResolvedValue({ items: [
      piece('Oxford', 'base_layer'), piece('Navy tee', 'base_layer'), piece('Loafers', 'footwear'), piece('Jeans', 'bottom'),
    ], dna: {}, signals: null })
    calls.classify.mockResolvedValue(null)
    const body = { view: 'ask', collection: 'masculine', question: 'عايز أشتري بنطلون للشغل تحت ١٢٠٠ جنيه' }
    const buy = await POST(request(body))
    const data = await buy.json()
    expect(data).toMatchObject({ status: 'shop', source: 'rules', suggestion: { product: { id: offer.id, url: offer.url } } })
    const looks = data.suggestion.looks as { pieces: { name: string; owned: boolean }[] }[]
    expect(looks).toHaveLength(2)
    expect(looks.every(({ pieces }) => pieces.filter(p => !p.owned).map(p => p.name).join() === offer.title)).toBe(true)
    expect(new Set(looks.map(({ pieces }) => pieces.filter(p => p.owned).map(p => p.name).sort().join())).size).toBe(2)
    expect(await (await POST(request({ ...body, budget: 899 }))).json()).toMatchObject({ status: 'no-match' })
    expect(await (await POST(request({ ...body, collection: 'feminine' }))).json()).toMatchObject({ status: 'no-match' })
    const owned = await (await POST(request({ ...body, question: 'ألبس إيه من دولابي؟' }))).json()
    expect(owned.status).toBe('restyle')
    expect(owned.suggestion).toBeUndefined()
  })
  it('rejects signed-out, cross-origin, disabled, and oversized requests without calling Gemini', async () => {
    const body = { view: 'ask', collection: 'masculine', question: 'What can I wear?' }
    calls.getUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(request(body))).status).toBe(401)
    expect((await POST(request(body, 'https://other.example'))).status).toBe(403)
    expect((await POST(request({ ...body, extra: 'x'.repeat(5000) }))).status).toBe(400)
    vi.stubEnv('ENABLE_STYLIST', 'false')
    expect((await POST(request(body))).status).toBe(404)
    expect(calls.loadWardrobe).not.toHaveBeenCalled()
    expect(calls.classify).not.toHaveBeenCalled()
  })
  it('allows the browser host when Next normalizes the URL to localhost', async () => {
    const makeRequest = (origin: string, site: string) => new Request('http://localhost:3117/api/stylist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', host: '127.0.0.1:3117', origin, 'sec-fetch-site': site },
      body: JSON.stringify({ view: 'daily', collection: 'masculine' }),
    })
    expect((await POST(makeRequest('http://127.0.0.1:3117', 'same-origin'))).status).toBe(200)
    expect((await POST(makeRequest('http://localhost:3117', 'same-site'))).status).toBe(403)
    expect((await POST(makeRequest('http://127.0.0.1:3117', 'cross-site'))).status).toBe(403)
  })
  it('loads wardrobe for the signed-in user and passes only the question to the model', async () => {
    calls.classify.mockResolvedValue(null)
    const question = 'ألبس إيه من دولابي؟'
    const result = await POST(request({ view: 'ask', collection: 'feminine', question, userId: 'ignored-user' }))
    expect(result.headers.get('Cache-Control')).toBe('private, no-store')
    expect(calls.loadWardrobe).toHaveBeenCalledWith(expect.anything(), 'current-user')
    expect(calls.classify).toHaveBeenCalledWith(question, expect.objectContaining({ key: 'test-only' }))
    expect(await result.json()).toMatchObject({ status: 'restyle', source: 'rules' })
  })
  it('does not send Daily Finds to Gemini and does not shop with a model-invented budget', async () => {
    const r = await POST(request({ view: 'daily', collection: 'masculine' }))
    expect(await r.json()).toMatchObject({ status: 'restyle' })
    expect(calls.classify).not.toHaveBeenCalled()
    calls.classify.mockResolvedValue({ mode: 'shop', role: 'bottom', occasion: 'work', budget: 2000 })
    const ask = await POST(request({ view: 'ask', collection: 'masculine', question: 'Find me work trousers' }))
    expect(await ask.json()).toMatchObject({ status: 'clarify', clarification: 'budget' })
  })
  it('logs opt-in aggregate results and distinguishes Gemini fallback without logging wardrobe or prompt text', async () => {
    vi.stubEnv('STYLIST_PILOT_METRICS', 'true')
    calls.classify.mockResolvedValue(null)
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      const response = await POST(request({
        view: 'ask', collection: 'masculine', question: 'ألبس إيه من دولابي للميعاد؟',
      }))
      expect(response.status).toBe(200)
      expect(log).toHaveBeenCalledTimes(1)
      expect(JSON.parse(log.mock.calls[0][0])).toEqual({
        event: 'stylist_pilot', view: 'ask', outcome: 'restyle', intent: 'fallback',
        catalog: 'not-needed', elapsedMs: expect.any(Number),
      })
    } finally {
      log.mockRestore()
    }
  })
})
