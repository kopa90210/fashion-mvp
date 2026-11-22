import type { Product } from './catalog'
import { gaps, type Collection, type Gap } from './intent'

const PAGE_SIZE = 12
const sorts = ['relevance', 'price-asc', 'price-desc'] as const
type Sort = typeof sorts[number]
type BrowseFilters = { q: string; collection: Collection | null; role: Gap | null; maxPrice: number | null; sort: Sort; page: number }
export type BrowseResult = { offers: Pick<Product, 'id' | 'title' | 'brand' | 'role' | 'priceEgp' | 'url' | 'checkedAt' | 'demo'>[]; total: number; page: number; hasMore: boolean; catalogAvailable: boolean }

export function parseBrowseFilters(params: URLSearchParams): BrowseFilters | null {
  for (const key of ['q', 'collection', 'role', 'maxPrice', 'sort', 'page']) {
    if (params.getAll(key).length > 1) return null
  }
  const q = (params.get('q') ?? '').trim()
  const collection = params.get('collection') || null
  const role = params.get('role') || null
  const price = params.get('maxPrice') || null
  const page = params.get('page') ?? '1'
  const sort = params.get('sort') ?? 'relevance'
  if (q.length > 100 || (collection !== null && collection !== 'masculine' && collection !== 'feminine') ||
      (role !== null && !gaps.includes(role as Gap)) || !sorts.includes(sort as Sort) ||
      (price !== null && (!/^\d{1,6}(\.\d{1,2})?$/.test(price) || Number(price) <= 0 || Number(price) > 100_000)) ||
      !/^(?:[1-9]|1\d|2[01])$/.test(page)) return null
  return { q, collection, role: role as Gap | null, maxPrice: price === null ? null : Number(price), sort: sort as Sort, page: Number(page) }
}

const searchable = (text: string) => text.normalize('NFKD').toLowerCase()
  .replace(/\p{M}|ـ/gu, '').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()

const roleNames: Record<Gap, string> = {
  base_layer: 'tops shirt shirts قميص قمصان تيشيرت',
  bottom: 'bottoms trousers pants jeans بنطلون بناطيل',
  one_piece: 'dresses فستان فساتين',
  footwear: 'shoes footwear حذاء احذية جزمة',
  outerwear: 'jackets coat جاكيت معطف',
}

export function browseCatalog(catalog: Product[], filters: BrowseFilters): BrowseResult {
  const query = searchable(filters.q)
  const tokens = query ? [...new Set(query.split(' '))] : []
  const scored = catalog.flatMap(offer => {
    if ((filters.collection && offer.collection !== 'shared' && filters.collection !== offer.collection) ||
        (filters.role && offer.role !== filters.role) ||
        (filters.maxPrice !== null && offer.priceEgp > filters.maxPrice)) return []
    const title = searchable(offer.title)
    const searchableOffer = [title, searchable(offer.brand), searchable(roleNames[offer.role])].join(' ')
    if (!tokens.every(token => searchableOffer.includes(token))) return []
    return [{ offer, score: Number(Boolean(query) && title.includes(query)) * 2 + tokens.filter(token => title.includes(token)).length }]
  })
  scored.sort((a, b) => (filters.sort === 'price-asc' ? a.offer.priceEgp - b.offer.priceEgp
    : filters.sort === 'price-desc' ? b.offer.priceEgp - a.offer.priceEgp : b.score - a.score)
    || b.score - a.score || a.offer.priceEgp - b.offer.priceEgp || a.offer.id.localeCompare(b.offer.id))
  const offset = (filters.page - 1) * PAGE_SIZE
  const offers = scored.slice(offset, offset + PAGE_SIZE).map(({ offer: { id, title, brand, role, priceEgp, url, checkedAt, demo } }) =>
    ({ id, title, brand, role, priceEgp, url, checkedAt, demo }))
  return { offers, total: scored.length, page: filters.page, hasMore: offset + PAGE_SIZE < scored.length, catalogAvailable: catalog.length > 0 }
}
