import { recommendOutfits, type Outfit, type WardrobeItem } from '@/src/lib/outfit/engine'
import type { QuizSignals, StyleVector } from '@/src/lib/quiz/scoring'
import { searchCatalog, type Product } from './catalog'
import { analyzeNeeds, cairoDay, type DailyNeeds, type WardrobeNeed } from './daily-needs'
import type { Collection, Intent } from './intent'

export type StylistContext = { items: WardrobeItem[]; dna: StyleVector; signals: QuizSignals | null }
export type Look = { pieces: { name: string; owned: boolean }[] }
export type Result = {
  status: 'restyle' | 'shop' | 'clarify' | 'no-match' | 'empty'
  looks: Look[]
  source?: 'gemini' | 'rules'
  suggestion?: { product: Product; looks: Look[]; need?: WardrobeNeed }
  clarification?: 'category' | 'budget' | 'intent'
  daily?: DailyNeeds
}
const look = (o: Outfit, candidate?: string): Look => ({
  pieces: o.items.map((p) => ({ name: p.display_name, owned: p.id !== candidate })),
})
const nameKey = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
const core = new Set(['base_layer', 'bottom', 'one_piece', 'footwear'])
const occasion = { work: 'work-university', 'going-out': 'going-out', everyday: 'everyday-errands' } as const

function chooseProduct(context: StylistContext, candidates: Product[], occasionHint?: typeof occasion[keyof typeof occasion]) {
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
    const options = recommendOutfits([...pool, candidate], context.dna, {
      topN: 5, anchorItemId: anchor, signals: context.signals, occasion: occasionHint,
    })
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

function dailyRecommendation(ctx: StylistContext, catalog: Product[], intent: Intent, collection: Collection, now: number): Result {
  const date = cairoDay(now)
  const needs = analyzeNeeds(ctx.items, collection)
  const daily = { date, occasion: intent.occasion, gaps: needs.slice(0, 3) }
  if (!ctx.items.length) return { status: 'empty', looks: [], daily }
  const options = recommendOutfits(ctx.items.filter(item => core.has(item.layer_role)), ctx.dna, {
    topN: 3, signals: ctx.signals, occasion: occasion[intent.occasion],
  })
  const index = (Date.parse(date + 'T00:00:00Z') / 86_400_000) % (options.length || 1)
  const selected = options[index]
  const looks = selected ? [look(selected)] : []
  if (intent.budget !== null) {
    for (const need of needs) {
      // A role with fewer than two possible combinations cannot satisfy the
      // same two-distinct-looks contract as a normal explicit shopping request.
      if (need.possibleNewCombinations < 2) continue
      const candidates = searchCatalog(catalog, { ...intent, role: need.role }, collection).slice(0, 5)
      const match = chooseProduct(ctx, candidates, occasion[intent.occasion])
      if (match) return { status: 'shop', looks, suggestion: { ...match, need }, daily }
    }
  }
  return { status: looks.length ? 'restyle' : 'no-match', looks, daily }
}

export function recommendations(ctx: StylistContext, catalog: Product[], intent: Intent, collection: Collection, daily = false, now = Date.now()): Result {
  const effective = ctx.signals && (daily || intent.occasion !== 'everyday')
    ? { ...ctx, signals: { ...ctx.signals, primaryOccasion: occasion[intent.occasion] } }
    : ctx
  if (daily) return dailyRecommendation(effective, catalog, intent, collection, now)
  if (!ctx.items.length) return { status: 'empty', looks: [] }
  const looks = recommendOutfits(effective.items, effective.dna, { topN: 1, signals: effective.signals })
    .map((o) => look(o))
  if (intent.mode === 'clarify') return { status: 'clarify', looks: [], clarification: 'intent' }
  if (intent.mode === 'restyle') return { status: looks.length ? 'restyle' : 'no-match', looks }
  if (!intent.role) return { status: 'clarify', looks, clarification: 'category' }
  if (intent.budget === null) return { status: 'clarify', looks, clarification: 'budget' }
  const candidates = searchCatalog(catalog, intent, collection)
  const suggestion = chooseProduct(effective, candidates)
  return { status: suggestion ? 'shop' : 'no-match', looks, ...(suggestion ? { suggestion } : {}) }
}
