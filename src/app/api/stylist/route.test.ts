import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WardrobeItem } from '@/src/lib/outfit/engine'

const calls = vi.hoisted(() => ({
  getUser: vi.fn(), loadWardrobe: vi.fn(), classify: vi.fn(), reserve: vi.fn(), begin: vi.fn(), finish: vi.fn(),
}))
vi.mock('@/src/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: calls.getUser } })),
}))
vi.mock('@/src/lib/stylist/wardrobe', () => ({ loadStylistWardrobe: calls.loadWardrobe }))
vi.mock('@/src/lib/stylist/gemini', () => ({ classifyWithGemini: calls.classify }))

vi.mock('@/src/lib/stylist/quota', () => ({ reserveStylistQuota: calls.reserve, beginStylistAi: calls.begin, finishStylistAi: calls.finish }))

import { POST } from './route'

const piece = (name: string, layer_role: WardrobeItem['layer_role']) => ({
  id: name, display_name: name, layer_role, style_tags: {}, image_url: null,
})
const requestId = '11111111-1111-4111-8111-111111111111'
const token = '22222222-2222-4222-8222-222222222222'
function request(body: object, origin = 'https://style.example') {
  return new Request('https://style.example/api/stylist', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': requestId, origin }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('ENABLE_STYLIST', 'true')
  vi.stubEnv('GEMINI_STYLIST_MODEL', 'gemini-3.1-flash-lite')
  vi.stubEnv('GEMINI_STYLIST_API_KEY', 'test-only')
  vi.stubEnv('STYLIST_CATALOG_JSON', '')
  calls.reserve.mockResolvedValue(true)
  calls.begin.mockResolvedValue({ status: 'claimed', token })
  calls.finish.mockResolvedValue(undefined)
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
    expect(calls.reserve).not.toHaveBeenCalled()
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
    expect(calls.reserve.mock.calls).toEqual([['current-user', 'api_hourly']])
    expect(calls.begin).toHaveBeenCalledWith('current-user', requestId, expect.stringMatching(/^[0-9a-f]{64}$/), 'gemini-3.1-flash-lite')
    expect(calls.classify).toHaveBeenCalledWith(question, expect.objectContaining({ key: 'test-only' }))
    expect(await result.json()).toMatchObject({ status: 'restyle', source: 'rules' })
  })
  it('does not send Daily Finds to Gemini and does not shop with a model-invented budget', async () => {
    const r = await POST(request({ view: 'daily', collection: 'masculine' }))
    expect(await r.json()).toMatchObject({ status: 'restyle' })
    expect(calls.classify).not.toHaveBeenCalled()
    expect(calls.reserve.mock.calls).toEqual([['current-user', 'api_hourly']])
    calls.classify.mockResolvedValue({ mode: 'shop', role: 'bottom', occasion: 'work', budget: 2000 })
    const ask = await POST(request({ view: 'ask', collection: 'masculine', question: 'Find me work trousers' }))
    expect(await ask.json()).toMatchObject({ status: 'clarify', clarification: 'budget' })
  })

  it('rejects exhausted API quota before loading wardrobe or invoking Gemini', async () => {
    calls.reserve.mockResolvedValueOnce(false)
    const r = await POST(request({ view: 'ask', collection: 'masculine', question: 'What can I wear?' }))
    expect(r.status).toBe(429)
    expect(await r.json()).toMatchObject({ code: 'STYLIST_RATE_LIMIT' })
    expect(calls.loadWardrobe).not.toHaveBeenCalled()
    expect(calls.classify).not.toHaveBeenCalled()
  })

  it.each(['individual daily', 'global daily', 'global monthly'])('uses deterministic styling when %s Gemini quota is exhausted', async () => {
    calls.begin.mockResolvedValueOnce({ status: 'completed', intent: null })
    const r = await POST(request({ view: 'ask', collection: 'masculine', question: 'What can I wear?' }))
    expect(r.status).toBe(200)
    expect(await r.json()).toMatchObject({ source: 'rules', status: 'restyle' })
    expect(calls.reserve.mock.calls).toEqual([['current-user', 'api_hourly']])
    expect(calls.begin).toHaveBeenCalledWith('current-user', requestId, expect.stringMatching(/^[0-9a-f]{64}$/), 'gemini-3.1-flash-lite')
    expect(calls.classify).not.toHaveBeenCalled()
  })

  it.each([0, 1])('fails closed on quota RPC error at stage %s', async (stage) => {
    if (stage === 1) calls.begin.mockRejectedValueOnce(new Error('quota unavailable'))
    else calls.reserve.mockRejectedValueOnce(new Error('quota unavailable'))
    const r = await POST(request({ view: 'ask', collection: 'masculine', question: 'What can I wear?' }))
    expect(r.status).toBe(503)
    expect(calls.classify).not.toHaveBeenCalled()
  })

  it('does not reserve Gemini quota when the key is missing or wardrobe empty', async () => {
    const body = { view: 'ask', collection: 'masculine', question: 'What can I wear?' }
    vi.stubEnv('GEMINI_STYLIST_API_KEY', '')
    expect((await POST(request(body))).status).toBe(200)
    vi.stubEnv('GEMINI_STYLIST_API_KEY', 'test-only')
    calls.loadWardrobe.mockResolvedValueOnce({ items: [], dna: {}, signals: null })
    expect((await POST(request(body))).status).toBe(200)
    expect(calls.reserve.mock.calls).toEqual([['current-user', 'api_hourly'], ['current-user', 'api_hourly']])
    expect(calls.classify).not.toHaveBeenCalled()
  })

  it('does not retry or refund an ambiguous provider failure', async () => {
    calls.classify.mockResolvedValueOnce(null)
    const r = await POST(request({ view: 'ask', collection: 'masculine', question: 'What can I wear?' }))
    expect(await r.json()).toMatchObject({ source: 'rules' })
    expect(calls.classify).toHaveBeenCalledTimes(1)
    expect(calls.finish).toHaveBeenCalledWith('current-user', requestId, token, null, 'gemini-3.1-flash-lite', expect.objectContaining({ status: 'network_error' }))
    expect(calls.reserve.mock.calls).toEqual([['current-user', 'api_hourly']])
    expect(calls.begin).toHaveBeenCalledWith('current-user', requestId, expect.stringMatching(/^[0-9a-f]{64}$/), 'gemini-3.1-flash-lite')
  })

  it.each(['busy', 'conflict'])('rejects %s claims without Gemini or completion', async (status) => {
    calls.begin.mockResolvedValueOnce({ status })
    const r = await POST(request({ view: 'ask', collection: 'masculine', question: 'What can I wear?' }))
    expect(r.status).toBe(409)
    expect(calls.classify).not.toHaveBeenCalled()
    expect(calls.finish).not.toHaveBeenCalled()
  })

  it('replays cached intent but loads the current wardrobe on every request', async () => {
    calls.begin.mockResolvedValue({ status: 'completed', intent: { mode: 'restyle', occasion: 'everyday', role: null, budget: null } })
    const body = { view: 'ask', collection: 'masculine', question: 'What can I wear?' }
    expect((await POST(request(body))).status).toBe(200)
    calls.loadWardrobe.mockResolvedValueOnce({ items: [], dna: {}, signals: null })
    const r = await POST(request(body))
    expect(await r.json()).toMatchObject({ status: 'empty' })
    expect(calls.loadWardrobe).toHaveBeenCalledTimes(2)
    expect(calls.classify).not.toHaveBeenCalled()
    expect(calls.finish).not.toHaveBeenCalled()
  })

  it('fails closed when completion is ambiguous', async () => {
    calls.classify.mockResolvedValueOnce(null)
    calls.finish.mockRejectedValueOnce(new Error('completion unavailable'))
    const r = await POST(request({ view: 'ask', collection: 'masculine', question: 'What can I wear?' }))
    expect(r.status).toBe(503)
    expect(calls.classify).toHaveBeenCalledTimes(1)
  })

  it('rejects missing idempotency key for Ask', async () => {
    const r = await POST(new Request('https://style.example/api/stylist', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ view: 'ask', collection: 'masculine', question: 'What can I wear?' }),
    }))
    expect(r.status).toBe(400)
    expect(calls.reserve).not.toHaveBeenCalled()
  })
})

describe('P0-05 request metrics', () => {
  it('logs provider fallback without question, identifiers or credentials', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      calls.classify.mockResolvedValueOnce(null)
      expect((await POST(request({ view: 'ask', collection: 'masculine', question: 'What can I wear? private marker' }))).status).toBe(200)
      expect(log).toHaveBeenCalledTimes(1)
      const raw = String(log.mock.calls[0][0])
      expect(JSON.parse(raw)).toMatchObject({ event: 'stylist.request', status: 200, outcome: 'success', aiPath: 'provider_fallback' })
      for (const value of ['private marker', 'current-user', requestId, 'test-only']) expect(raw).not.toContain(value)
    } finally { log.mockRestore() }
  })
  it('classifies quota dependency failure without raw exception text', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {})
    try {
      calls.reserve.mockRejectedValueOnce(new Error('private dependency detail'))
      expect((await POST(request({ view: 'daily', collection: 'masculine' }))).status).toBe(503)
      const raw = String(log.mock.calls[0][0])
      expect(JSON.parse(raw)).toMatchObject({ status: 503, outcome: 'failure', failureStage: 'api_quota' })
      expect(raw).not.toContain('private dependency detail')
    } finally { log.mockRestore() }
  })
})
