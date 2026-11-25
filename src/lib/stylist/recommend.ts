import { recommendOutfits, isValidOutfitStructure, type Outfit, type WardrobeItem } from '@/src/lib/outfit/engine'
import type { QuizSignals, StyleVector } from '@/src/lib/quiz/scoring'
import { searchCatalog, type Product } from './catalog'
import { gaps, type Collection, type Intent } from './intent'

export type StylistContext = { items: WardrobeItem[]; dna: StyleVector; signals: QuizSignals | null }
export type Look = { pieces: { name: string; owned: boolean }[] }
export type Result = {
  status: 'restyle' | 'shop' | 'clarify' | 'no-match' | 'empty'
  looks: Look[]
  source?: 'gemini' | 'rules'
  provenance?: import('./metered-stylist').StylistProvenance
  explanation?: string[]
  stylingTip?: string | null
  shoppingTrace?: import('./metered-shopper').ShoppingTrace
  suggestion?: { product: Product; looks: Look[]; unlockCount: number; unlockBasis?: 'ai_reviewed_sample' | 'structural_sample'; evaluatedCount?: number }
  clarification?: 'category' | 'budget' | 'intent'
}
const look = (o: Outfit, candidate?: string): Look => ({
  pieces: o.items.map((p) => ({ name: p.display_name, owned: p.id !== candidate })),
})
const nameKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
// Conservative lexical overlap, not an inference of visual equivalence.
export function redundancyPenalty(items: WardrobeItem[], product: Product): number {
  const tokens = (s: string) => new Set(s.normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
  const target = tokens(product.title)
  let max = 0
  for (const item of items) {
    if (item.layer_role !== product.role) continue
    const owned = tokens(item.display_name)
    const union = new Set([...target, ...owned]).size
    const overlap = [...target].filter(t => owned.has(t)).length
    if (union) max = Math.max(max, overlap / union)
  }
  return max
}
const core = new Set(['base_layer', 'bottom', 'one_piece', 'footwear'])

// Exact count of new canonical core combinations, excluding optional accessories.
// An outerwear addition creates one new layered variant per existing core.
export function incrementalUnlockCount(items: WardrobeItem[], role: Product['role']): number {
  const count = (r: WardrobeItem['layer_role']) => new Set(items.filter(i => i.layer_role === r).map(i => i.id)).size
  const b = count('base_layer'), t = count('bottom'), d = count('one_piece'), s = count('footwear')
  switch (role) {
    case 'base_layer': return t * s
    case 'bottom': return b * s
    case 'one_piece': return s
    case 'footwear': return b * t + d
    case 'outerwear': return (b * t + d) * s
  }
}

function chooseProduct(context: StylistContext, candidates: Product[]) {
  let best: { product: Product; outfits: Outfit[]; score: number; unlockCount: number; adjustedUnlock: number } | undefined
  const ownedProductNames = new Set(context.items.map((i) => nameKey(i.display_name)))
  for (const product of candidates.slice(0, 25)) {
    if (ownedProductNames.has(nameKey(product.title))) continue
    const unlockCount = incrementalUnlockCount(context.items, product.role)
    if (unlockCount < 2) continue
    const penalty = redundancyPenalty(context.items, product)
    const adjustedUnlock = unlockCount * (1 - 0.5 * penalty)
    const anchor = `catalog:${product.id}`
    const candidate: WardrobeItem = {
      id: anchor, display_name: product.title, image_url: null,
      layer_role: product.role, style_tags: product.styleTags,
    }
    const pool = context.items.filter((item) => item.layer_role !== 'accessory' && item.layer_role !== 'outerwear')
    const options = recommendOutfits([...pool, candidate], context.dna, { topN: 5, anchorItemId: anchor, signals: context.signals })
    const ownedIds = new Set(pool.map(i => i.id))
    const unique = new Map<string, Outfit>()
    for (const outfit of options) {
      if (!isValidOutfitStructure(outfit.items) || outfit.items.some(i => i.id !== anchor && !ownedIds.has(i.id))) continue
      if (!outfit.items.some((i) => i.id === anchor) || !outfit.items.some((i) => i.id !== anchor)) continue
      const key = outfit.items.filter((i) => i.id !== anchor && core.has(i.layer_role)).map(i => i.id).sort().join('|')
      if (key && !unique.has(key)) unique.set(key, outfit)
    }
    const outfits = [...unique.values()]
    if (outfits.length < 2) continue
    const score = outfits.slice(0, 2).reduce((n, o) => n + o.score, 0)
    if (!best || adjustedUnlock > best.adjustedUnlock ||
      (adjustedUnlock === best.adjustedUnlock && (score > best.score ||
        (score === best.score && product.priceEgp < best.product.priceEgp)))) best = { product, outfits, score, unlockCount, adjustedUnlock }
  }
  return best ? { product: best.product, unlockCount: best.unlockCount, looks: best.outfits.slice(0, 2).map((o) => look(o, `catalog:${best.product.id}`)) } : undefined
}

export function recommendations(ctx: StylistContext, catalog: Product[], intent: Intent, collection: Collection, daily = false): Result {
  const validRoles = new Set(['base_layer', 'bottom', 'one_piece', 'footwear', 'outerwear', 'accessory'])
  const unique = new Map<string, WardrobeItem>()
  for (const item of ctx.items) {
    if (typeof item.id !== 'string' || !item.id || item.id.startsWith('catalog:') ||
        typeof item.display_name !== 'string' || !item.display_name.trim() || !validRoles.has(item.layer_role)) continue
    if (!unique.has(item.id)) unique.set(item.id, item)
  }
  ctx = { ...ctx, items: [...unique.values()] }
  if (!ctx.items.length) return { status: 'empty', looks: [] }
  const occasion = { work: 'work-university', 'going-out': 'going-out', everyday: 'everyday-errands' } as const
  // Formality is only a proxy: unknown metadata stays eligible, known extremes are excluded.
  const range = { work: [0.3, 1], 'going-out': [0.25, 1], everyday: [0, 0.8] }[intent.occasion]
  const effective = {
    ...ctx,
    items: ctx.items.filter(i => typeof i.formality_score !== 'number' ||
      !Number.isFinite(i.formality_score) || (i.formality_score >= range[0] && i.formality_score <= range[1])),
    signals: ctx.signals ? { ...ctx.signals, primaryOccasion: occasion[intent.occasion] } : null,
  }
  const looks = recommendOutfits(effective.items, effective.dna, { topN: 1, signals: effective.signals })
    .filter(o => isValidOutfitStructure(o.items))
    .map((o) => look(o))
  if (!daily && intent.mode === 'clarify') return { status: 'clarify', looks: [], clarification: 'intent' }
  if (!daily && intent.mode === 'restyle') return { status: looks.length ? 'restyle' : 'no-match', looks }
  if (!daily && !intent.role) return { status: 'clarify', looks, clarification: 'category' }
  if (!daily && intent.budget === null) return { status: 'clarify', looks, clarification: 'budget' }
  const candidates = daily
    ? gaps.flatMap((role) => searchCatalog(catalog, { ...intent, role }, collection).slice(0, 5))
    : searchCatalog(catalog, intent, collection)
  const suggestion = chooseProduct(effective, candidates)
  return { status: suggestion ? 'shop' : daily && looks.length ? 'restyle' : 'no-match', looks, ...(suggestion ? { suggestion } : {}) }
}
