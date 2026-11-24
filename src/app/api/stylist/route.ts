import { createHash } from 'node:crypto'
import { createClient } from '@/src/lib/supabase/server'
import { readCatalog } from '@/src/lib/stylist/catalog'
import { classifyWithGemini } from '@/src/lib/stylist/gemini'
import { resolveIntent, type Collection, type Intent } from '@/src/lib/stylist/intent'
import { recommendations } from '@/src/lib/stylist/recommend'
import { reserveStylistQuota, beginStylistAi, finishStylistAi } from '@/src/lib/stylist/quota'
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
  const requestId = request.headers.get('Idempotency-Key')
  if (!daily && (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))) {
    return json({ error: 'A valid Idempotency-Key is required' }, 400)
  }
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return json({ error: 'Sign in to use your wardrobe' }, 401)
    if (!await reserveStylistQuota(user.id, 'api_hourly')) {
      return json({ error: 'Stylist hourly limit reached. Try again later.', code: 'STYLIST_RATE_LIMIT' }, 429)
    }
    const context = await loadStylistWardrobe(supabase, user.id)
    const key = process.env.GEMINI_STYLIST_API_KEY
    // Never send the wardrobe, Style DNA, item IDs, or product data to Gemini.
    let model: Intent | null = null
    if (!daily && context.items.length && key && requestId) {
      const fingerprint = createHash('sha256').update(JSON.stringify([question, collection, budget])).digest('hex')
      const claim = await beginStylistAi(user.id, requestId, fingerprint)
      if (claim.status === 'busy') return json({ error: 'A styling request is still processing. Try again shortly.', code: 'STYLIST_BUSY' }, 409)
      if (claim.status === 'conflict') return json({ error: 'Request identifier was already used for different inputs.', code: 'STYLIST_KEY_CONFLICT' }, 409)
      if (claim.status === 'completed') model = claim.intent
      if (claim.status === 'claimed') {
        model = await classifyWithGemini(question, {
          key, model: process.env.GEMINI_STYLIST_MODEL ?? 'gemini-3.1-flash-lite',
        })
        await finishStylistAi(user.id, requestId, claim.token, model)
      }
    }
    const resolved = resolveIntent(question, model)
    const intent: Intent = daily ? { mode: 'shop', occasion: context.signals?.primaryOccasion === 'work-university' ? 'work' : context.signals?.primaryOccasion === 'going-out' ? 'going-out' : 'everyday', role: null, budget }
      : { ...resolved, budget: resolved.budget === null ? budget : budget === null ? resolved.budget : Math.min(resolved.budget, budget) }
    return json({ ...recommendations(context, readCatalog(process.env.STYLIST_CATALOG_JSON), intent, collection, daily), source: model ? 'gemini' : 'rules' })
  } catch {
    return json({ error: 'Could not load your styling recommendations. Try again.' }, 503)
  }
}
