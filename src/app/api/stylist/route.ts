import { createClient } from '@/src/lib/supabase/server'
import { readCatalog } from '@/src/lib/stylist/catalog'
import { classifyWithGemini } from '@/src/lib/stylist/gemini'
import { resolveIntent, type Collection, type Intent } from '@/src/lib/stylist/intent'
import { pilotAllows, recordPilotEvent } from '@/src/lib/stylist/pilot'
import { recommendations } from '@/src/lib/stylist/recommend'
import { loadStylistWardrobe } from '@/src/lib/stylist/wardrobe'

const MAX_BYTES = 4096
const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'private, no-store' },
})

async function readInput(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.body || request.headers.get('content-type')?.split(';')[0] !== 'application/json') return null
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = '', size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) { await reader.cancel(); return null }
      text += decoder.decode(value, { stream: true })
    }
    const data = JSON.parse(text + decoder.decode())
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

export async function POST(request: Request) {
  if (process.env.ENABLE_STYLIST !== 'true') return json({ error: 'Stylist is not enabled' }, 404)
  const origin = request.headers.get('origin')
  const url = new URL(request.url)
  // Next can normalize the hostname in request.url to localhost in development.
  const host = request.headers.get('host') ?? url.host
  if (request.headers.get('sec-fetch-site') === 'cross-site' ||
      (origin && origin !== url.protocol + '//' + host)) return json({ error: 'Request origin is not allowed' }, 403)
  const input = await readInput(request)
  if (!input || (input.view !== 'ask' && input.view !== 'daily') ||
      (input.collection !== 'masculine' && input.collection !== 'feminine')) return json({ error: 'Invalid request' }, 400)
  const collection: Collection = input.collection
  const daily = input.view === 'daily'
  const question = typeof input.question === 'string' ? input.question.trim() : ''
  if (!daily && (!question || question.length > 280)) return json({ error: 'Enter a question of up to 280 characters' }, 400)
  const budget = input.budget ?? null
  if (budget !== null && (typeof budget !== 'number' || !Number.isInteger(budget) || budget < 1 || budget > 100_000)) {
    return json({ error: 'Enter a whole EGP budget between 1 and 100,000' }, 400)
  }
  const startedAt = performance.now()
  const view = daily ? 'daily' : 'ask'
  let admitted = false
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Sign in to use your wardrobe' }, 401)
    if (!pilotAllows(user.id)) return json({ error: 'Stylist is not enabled' }, 404)
    admitted = true
    const context = await loadStylistWardrobe(supabase, user.id)
    const key = process.env.GEMINI_STYLIST_API_KEY
    // Never send the wardrobe, Style DNA, item IDs, or product data to Gemini.
    const model = !daily && context.items.length && key ? await classifyWithGemini(question, {
      key, model: process.env.GEMINI_STYLIST_MODEL ?? 'gemini-3.1-flash-lite',
    }) : null
    const resolved = resolveIntent(question, model)
    const intent: Intent = daily ? { mode: 'shop', occasion: context.signals?.primaryOccasion === 'work-university' ? 'work' : context.signals?.primaryOccasion === 'going-out' ? 'going-out' : 'everyday', role: null, budget }
      : { ...resolved, budget: resolved.budget === null ? budget : budget === null ? resolved.budget : Math.min(resolved.budget, budget) }
    const needsCatalog = intent.mode === 'shop' && intent.budget !== null && Boolean(intent.role || daily) && Boolean(context.items.length)
    const catalog = needsCatalog ? readCatalog(process.env.STYLIST_CATALOG_JSON) : []
    const result = recommendations(context, catalog, intent, collection, daily)
    recordPilotEvent({
      view, outcome: result.status, elapsedMs: Math.round(performance.now() - startedAt),
      catalog: needsCatalog ? catalog.length ? 'ready' : 'empty' : 'not-needed',
      intent: model ? 'gemini' : daily || !context.items.length ? 'not-used' : key ? 'fallback' : 'rules',
    })
    return json({ ...result, source: model ? 'gemini' : 'rules' })
  } catch {
    if (admitted) recordPilotEvent({
      view, outcome: 'unavailable', elapsedMs: Math.round(performance.now() - startedAt),
      catalog: 'not-needed', intent: 'unknown',
    })
    return json({ error: 'Could not load your styling recommendations. Try again.' }, 503)
  }
}
