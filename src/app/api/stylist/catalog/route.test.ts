import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ getUser: vi.fn() }))
vi.mock('@/src/lib/supabase/server', () => ({ createClient: async () => ({ auth }) }))
import { GET } from './route'

const endpoint = 'https://staging.example/api/stylist/catalog'
const request = (filters = '') => new Request(endpoint + filters)
const offer = {
  id: 'jeans', title: 'Indigo jeans', url: 'https://www.defacto.com.eg/sample/jeans', currency: 'EGP',
  priceEgp: 849.50, stock: 'in_stock', collection: 'masculine', role: 'bottom', occasions: ['everyday'],
}
const withCatalog = (...rows: Array<Record<string, unknown>>) => vi.stubEnv('STYLIST_CATALOG_JSON', JSON.stringify(rows.map(row => ({ checkedAt: new Date().toISOString(), ...row }))))

beforeEach(() => {
  vi.stubEnv('ENABLE_STYLIST', 'true')
  vi.stubEnv('STYLIST_PILOT_USER_IDS', 'allowed')
  auth.getUser.mockReset().mockResolvedValue({ data: { user: { id: 'allowed' } } })
  withCatalog(offer)
})
afterEach(() => vi.unstubAllEnvs())

describe('reviewed catalog search', () => {
  it('requires both a signed-in account and pilot membership', async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: null } }).mockResolvedValueOnce({ data: { user: { id: 'outside' } } })
    expect((await GET(request())).status).toBe(401)
    expect((await GET(request())).status).toBe(404)
    vi.stubEnv('ENABLE_STYLIST', 'false')
    expect((await GET(request())).status).toBe(404)
  })

  it('validates filters and rejects ambiguous or oversized input', async () => {
    for (const query of ['?sort=bad', '?maxPrice=0', '?role=tie', '?page=22', '?q=a&q=b', '?q=' + 'a'.repeat(101)]) {
      expect((await GET(request(query))).status).toBe(400)
    }
  })

  it('matches Arabic category keywords and honors decimal budgets, collection, stock and freshness', async () => {
    withCatalog(offer,
      { ...offer, id: 'stale', url: offer.url + '-stale', checkedAt: '2020-01-01T00:00:00Z' },
      { ...offer, id: 'unknown', url: offer.url + '-unknown', stock: 'unknown' },
      { ...offer, id: 'other', url: offer.url + '-other', collection: 'feminine' })
    const query = '?collection=masculine&role=bottom&q=' + encodeURIComponent('بَنطلون')
    const response = await GET(request(query + '&maxPrice=849.50'))
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toMatchObject({ total: 1, offers: [{ id: 'jeans', priceEgp: 849.50, brand: 'DeFacto' }] })
    expect(await (await GET(request(query + '&maxPrice=849.49'))).json()).toMatchObject({ total: 0, catalogAvailable: true })
  })

  it('paginates a sorted result and distinguishes an empty catalog from no matches', async () => {
    withCatalog(...Array.from({ length: 13 }, (_, i) => ({ ...offer, id: `item-${i}`, url: `${offer.url}-${i}`, priceEgp: i + 100 })))
    expect(await (await GET(request('?sort=price-desc&page=2'))).json()).toMatchObject({
      total: 13, page: 2, hasMore: false, offers: [{ id: 'item-0' }],
    })
    withCatalog()
    expect(await (await GET(request())).json()).toMatchObject({ total: 0, catalogAvailable: false })
  })
})
