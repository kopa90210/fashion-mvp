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
  calls.getUser.mockResolvedValue({ data: { user: { id: 'current-user' } } })
  calls.loadWardrobe.mockResolvedValue({ items: [
    piece('Oxford', 'base_layer'), piece('Loafers', 'footwear'), piece('Jeans', 'bottom'),
  ], dna: {}, signals: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('stylist HTTP boundary', () => {
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
})
