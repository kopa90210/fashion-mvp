import { STYLE_DIMENSIONS, type StyleVector } from '@/src/lib/quiz/scoring'
import { gaps, occasions, type Collection, type Gap, type Occasion, type Intent } from './intent'

const shops = {
  'www.lcwaikiki.eg': 'LC Waikiki',
  'www.defacto.com.eg': 'DeFacto',
  'concrete.store': 'Concrete',
} as const
const MAX_AGE_MS = 48 * 60 * 60 * 1000
export type Product = {
  id: string; title: string; brand: (typeof shops)[keyof typeof shops]; url: string; priceEgp: number
  checkedAt: string; collection: Collection | 'shared'; role: Gap; occasions: Occasion[]; styleTags: Partial<StyleVector>
}

export function readCatalog(json: string | undefined, now = Date.now()): Product[] {
  if (!json || json.length > 120_000) return []
  let entries: unknown
  try { entries = JSON.parse(json) } catch { return [] }
  if (!Array.isArray(entries) || entries.length > 250) return []
  const result = new Map<string, Product>()
  const urls = new Set<string>()
  for (const raw of entries) {
    if (!raw || typeof raw !== 'object') continue
    const p = raw as Partial<Product> & { stock?: unknown; currency?: unknown }
    if (typeof p.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(p.id) || result.has(p.id) ||
        typeof p.title !== 'string' || !p.title.trim() || p.title.length > 100 ||
        typeof p.url !== 'string' || p.url.length > 500 || typeof p.priceEgp !== 'number' ||
        !Number.isFinite(p.priceEgp) || p.priceEgp <= 0 || p.priceEgp > 100_000 ||
        p.currency !== 'EGP' || p.stock !== 'in_stock' ||
        typeof p.checkedAt !== 'string' || !p.role || !gaps.includes(p.role) ||
        !(p.collection === 'masculine' || p.collection === 'feminine' || p.collection === 'shared') ||
        !Array.isArray(p.occasions) || !p.occasions.length || !p.occasions.every((value) => occasions.includes(value))) continue
    const age = now - Date.parse(p.checkedAt)
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) continue
    let url: URL
    try { url = new URL(p.url) } catch { continue }
    if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash ||
        !Object.hasOwn(shops, url.hostname) || url.pathname === '/' || urls.has(url.href)) continue
    const brand = shops[url.hostname as keyof typeof shops]
    const styleTags: Partial<StyleVector> = {}
    if (p.styleTags && typeof p.styleTags === 'object') {
      for (const dimension of STYLE_DIMENSIONS) {
        const value = p.styleTags[dimension]
        if (typeof value === 'number' && value >= 0 && value <= 1) styleTags[dimension] = value
      }
    }
    result.set(p.id, { id: p.id, title: p.title.trim(), url: url.href, brand, priceEgp: p.priceEgp, checkedAt: p.checkedAt, collection: p.collection, role: p.role, occasions: p.occasions, styleTags })
    urls.add(url.href)
  }
  return [...result.values()]
}

export function searchCatalog(catalog: Product[], intent: Intent, collection: Collection): Product[] {
  if (!intent.role || intent.budget === null || intent.budget < 1) return []
  const budget = intent.budget
  return catalog.filter((p) => (p.collection === 'shared' || p.collection === collection) &&
      p.priceEgp <= budget && p.role === intent.role && p.occasions.includes(intent.occasion))
    .sort((a, b) => a.priceEgp - b.priceEgp || a.id.localeCompare(b.id))
    .slice(0, 20)
}
