import { recommendOutfits, type Outfit, type WardrobeItem } from '@/src/lib/outfit/engine'
import type { QuizSignals, StyleVector } from '@/src/lib/quiz/scoring'
import { searchCatalog, type Product } from './catalog'
import { gaps, type Collection, type Intent } from './intent'

export type StylistContext = { items: WardrobeItem[]; dna: StyleVector; signals: QuizSignals | null }
export type Look = { pieces: { name: string; owned: boolean }[] }
export type Result = {
  status: 'restyle' | 'shop' | 'clarify' | 'no-match' | 'empty'
  looks: Look[]
  source?: 'gemini' | 'rules'
  suggestion?: { product: Product; looks: Look[] }
  clarification?: 'category' | 'budget' | 'intent'
}
const look = (o: Outfit, candidate?: string): Look => ({
  pieces: o.items.map((p) => ({ name: p.display_name, owned: p.id !== candidate })),
})
const nameKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const core = new Set(['base_layer', 'bottom', 'one_piece', 'footwear'])

function chooseProduct(context: StylistContext, candidates: Product[]) {
  let best: { product: Product; outfits: Outfit[]; score: number } | undefined
  const ownedProductNames = new Set(context.items.map((i) => nameKey(i.display_name)))
  for (const product of candidates.slice(0, 25)) {
    if (ownedProductNames.has(nameKey(product.title))) continue
    const anchor = `catalog:${product.id}`
    const candidate: WardrobeItem = {
      id: anchor, display_name: product.title, image_url: null,
      layer_role: product.role, style_tags: product.styleTags,
    }
    const pool = context.items.filter((item) => item.layer_role !== 'accessory' && item.layer_role !== 'outerwear')
    const options = recommendOutfits([...pool, candidate], context.dna, { topN: 5, anchorItemId: anchor, signals: context.signals })
    const unique = new Map<string, Outfit>()
    for (const outfit of options) {
      if (!outfit.items.some((i) => i.id === anchor) || !outfit.items.some((i) => i.id !== anchor)) continue
      const key = outfit.items.filter((i) => i.id !== anchor && core.has(i.layer_role)).map(i => i.id).sort().join('|')
      if (key && !unique.has(key)) unique.set(key, outfit)
    }
    const outfits = [...unique.values()]
    if (outfits.length < 2) continue
    const score = outfits.slice(0, 2).reduce((n, o) => n + o.score, 0)
    if (!best || outfits.length > best.outfits.length ||
      (outfits.length === best.outfits.length && (score > best.score ||
        (score === best.score && product.priceEgp < best.product.priceEgp)))) best = { product, outfits, score }
  }
  return best ? { product: best.product, looks: best.outfits.slice(0, 2).map((o) => look(o, `catalog:${best.product.id}`)) } : undefined
}

export function recommendations(ctx: StylistContext, catalog: Product[], intent: Intent, collection: Collection, daily = false): Result {
  if (!ctx.items.length) return { status: 'empty', looks: [] }
  const occasion = { work: 'work-university', 'going-out': 'going-out', everyday: 'everyday-errands' } as const
  const effective = ctx.signals && (!daily && intent.occasion !== 'everyday')
    ? { ...ctx, signals: { ...ctx.signals, primaryOccasion: occasion[intent.occasion] } }
    : ctx
  const looks = recommendOutfits(effective.items, effective.dna, { topN: 1, signals: effective.signals })
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
