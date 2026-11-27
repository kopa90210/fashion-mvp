import { createStylistMetrics, type Outcome } from '@/src/lib/stylist/observability'
import type { AiTelemetry } from '@/src/lib/stylist/telemetry'
import { createHash } from 'node:crypto'
import { createClient } from '@/src/lib/supabase/server'
import { readCatalog } from '@/src/lib/stylist/catalog'
import { classifyWithGemini } from '@/src/lib/stylist/gemini'
import { resolveIntent, type Collection, type Intent } from '@/src/lib/stylist/intent'
import { discoveryGap } from '@/src/lib/stylist/discovery-gap'
import { discoveryEnabled, discoverRetailerLeads } from '@/src/lib/stylist/product-discovery'
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
  const metrics = createStylistMetrics()
  const respond = (data: unknown, status: number, outcome: Outcome) => { metrics.finish(status, outcome); return json(data, status) }
  try {
  if (process.env.ENABLE_STYLIST !== 'true') return respond({ error: 'Stylist is not enabled' }, 404, 'disabled')
  const origin = request.headers.get('origin')
  const url = new URL(request.url)
  // Next can normalize the hostname in request.url to localhost in development.
  const host = request.headers.get('host') ?? url.host
  if (request.headers.get('sec-fetch-site') === 'cross-site' ||
      (origin && origin !== url.protocol + '//' + host)) return respond({ error: 'Request origin is not allowed' }, 403, 'origin_denied')
  const input = await readInput(request)
  if (!input || (input.view !== 'ask' && input.view !== 'daily') ||
      (input.collection !== 'masculine' && input.collection !== 'feminine')) return respond({ error: 'Invalid request' }, 400, 'invalid_input')
  const collection: Collection = input.collection
  const daily = input.view === 'daily'
  metrics.view(input.view)
  const question = typeof input.question === 'string' ? input.question.trim() : ''
  if (!daily && (!question || question.length > 280)) return respond({ error: 'Enter a question of up to 280 characters' }, 400, 'invalid_input')
  const budget = input.budget ?? null
  if (budget !== null && (typeof budget !== 'number' || !Number.isInteger(budget) || budget < 1 || budget > 100_000)) {
    return respond({ error: 'Enter a whole EGP budget between 1 and 100,000' }, 400, 'invalid_input')
  }
  const requestId = request.headers.get('Idempotency-Key')
  if ((!daily || process.env.ENABLE_METERED_SHOPPER_AI === 'true') && (!requestId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))) {
    return respond({ error: 'A valid Idempotency-Key is required' }, 400, 'invalid_input')
  }
    metrics.stage('auth')
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return respond({ error: 'Sign in to use your wardrobe' }, 401, 'unauthenticated')
    metrics.stage('api_quota')
    if (!await reserveStylistQuota(user.id, 'api_hourly')) {
      return respond({ error: 'Stylist hourly limit reached. Try again later.', code: 'STYLIST_RATE_LIMIT' }, 429, 'rate_limited')
    }
    metrics.stage('wardrobe')
    const context = await loadStylistWardrobe(supabase, user.id)
    const catalog = readCatalog(process.env.STYLIST_CATALOG_JSON)
    // Explicit shopping uses one discovery reservation and at most three model attempts.
    // Unverified leads never enter the recommendation engine.
    const explicit = resolveIntent(question, null)
    const discoveryIntent: Intent = daily
      ? {mode:'shop',occasion:context.signals?.primaryOccasion==='work-university'?'work':context.signals?.primaryOccasion==='going-out'?'going-out':'everyday',role:null,budget}
      : {...explicit,budget:explicit.budget===null?budget:budget===null?explicit.budget:Math.min(explicit.budget,budget)}
    const inferredGap=discoveryIntent.mode==='shop'&&discoveryIntent.role===null
    let gapSource='DETERMINISTIC_ONLY'
    if(inferredGap){
      discoveryIntent.role=discoveryGap(context,discoveryIntent,collection)
      if(requestId&&context.items.length&&catalog.length===0&&discoveryEnabled()&&process.env.ENABLE_METERED_SHOPPER_AI==='true'&&discoveryIntent.budget!==null&&discoveryIntent.budget>0){
        const {meteredGap}=await import('@/src/lib/stylist/metered-gap')
        const gap=await meteredGap({userId:user.id,requestId,context,intent:{...discoveryIntent,role:null},collection,question})
        if(!gap)return respond({error:'Wardrobe analysis is still processing. Try again shortly.',code:'STYLIST_BUSY'},409,'busy')
        discoveryIntent.role=gap.role;gapSource=gap.source
        if(!gap.role){
          const owned=recommendations(context,[],{...discoveryIntent,mode:'restyle'},collection)
          return respond({...owned,explanation:[/[\u0600-\u06ff]/.test(question)?'مفيش إضافة واضحة تستاهل الشراء دلوقتي بناءً على البيانات المتاحة.':'No worthwhile purchase category was identified from the available wardrobe evidence.']},200,'success')
        }
      }
    }
    const labels={base_layer:'tops',bottom:'trousers',one_piece:'dresses',footwear:'shoes',outerwear:'jackets'} as const
    const arabic=/[\u0600-\u06ff]/.test(question)
    const arLabels={base_layer:'قطع علوية',bottom:'بناطيل',one_piece:'فساتين',footwear:'أحذية',outerwear:'جاكيتات'} as const
    const gapAdvice=inferredGap&&discoveryIntent.role ? [arabic?`هنبحث عن ${arLabels[discoveryIntent.role]} بناءً على عدد التركيبات الممكنة من هدومك. ده ترشيح مبدئي للفئة، مش تأكيد إنك محتاج تشتري.`:`Search priority: ${labels[discoveryIntent.role]}, based on ${gapSource==='PRIMARY_AI'?'AI wardrobe assessment and structural eligibility':'structural wardrobe opportunities'}. This is a category hypothesis, not proof that you need a purchase.`] : []
    if (requestId && context.items.length && catalog.length===0 && discoveryEnabled() &&
        process.env.ENABLE_METERED_SHOPPER_AI==='true' && discoveryIntent.mode==='shop' &&
        discoveryIntent.role!==null && discoveryIntent.budget!==null && discoveryIntent.budget>0) {
      metrics.stage('provider')
      const allowed=await reserveStylistQuota(user.id,'gemini_daily')
      const discovery=allowed?await discoverRetailerLeads(discoveryIntent,collection):{status:'unavailable' as const,leads:[]}
      const {verifyRetailerProducts}=await import('@/src/lib/stylist/retailer-verification')
      const verified=await verifyRetailerProducts(discovery.leads,discoveryIntent,collection)
      console.info(JSON.stringify({event:'stylist.retailer_verification',discovered:discovery.leads.length,verified:verified.length}))
      if(verified.length){
        const {meteredShopper}=await import('@/src/lib/stylist/metered-shopper')
        const result=await meteredShopper({userId:user.id,requestId,context,catalog:verified,intent:discoveryIntent,collection,daily,singleAttempt:true})
        if(!result)return respond({error:'Shopping decision unavailable or still processing. Try again shortly.',code:'STYLIST_BUSY'},409,'busy')
        metrics.stage('recommendation')
        return respond({...result,discovery,explanation:[...gapAdvice,...(result.explanation??[])]},200,'success')
      }
      metrics.stage('recommendation')
      return respond({...recommendations(context,catalog,discoveryIntent,collection,daily),discovery,explanation:[...gapAdvice,arabic?'مفيش منتج اتأكدنا من سعره وتوفره؛ مش هنرشح شراء قبل التحقق.':'No product offer was verified. We cannot recommend a purchase yet.']},200,'success')
    }
    if (daily && requestId && context.items.length && process.env.ENABLE_METERED_SHOPPER_AI === 'true') {
      metrics.stage('provider')
      const { meteredShopper } = await import('@/src/lib/stylist/metered-shopper')
      const intent: Intent = { mode: 'shop', occasion: context.signals?.primaryOccasion === 'work-university' ? 'work' : context.signals?.primaryOccasion === 'going-out' ? 'going-out' : 'everyday', role: null, budget }
      const result = await meteredShopper({userId:user.id,requestId,context,catalog,intent,collection,daily:true})
      if (!result) return respond({error:'Shopping decision unavailable or still processing. Try again shortly.',code:'STYLIST_BUSY'},409,'busy')
      metrics.stage('recommendation')
      return respond(result,200,'success')
    }
    if (!daily && requestId && context.items.length && process.env.ENABLE_METERED_STYLIST_AI === 'true') {
      metrics.stage('provider')
      const { meteredStylist } = await import('@/src/lib/stylist/metered-stylist')
      const result = await meteredStylist({ userId: user.id, requestId, question, collection, budget, context, catalog })
      if (!result) return respond({ error: 'Styling decision unavailable or still processing. Try again shortly.', code: 'STYLIST_BUSY' }, 409, 'busy')
      metrics.stage('recommendation')
      return respond(result, 200, 'success')
    }
    const key = process.env.GEMINI_STYLIST_API_KEY
    // Never send the wardrobe, Style DNA, item IDs, or product data to Gemini.
    let model: Intent | null = null
    metrics.aiPath(daily ? 'daily_rules' : !context.items.length ? 'empty_wardrobe' : !key ? 'missing_key' : 'not_evaluated')
    if (!daily && context.items.length && key && requestId) {
      metrics.stage('ai_claim')
      const fingerprint = createHash('sha256').update(JSON.stringify([question, collection, budget])).digest('hex')
      const providerModel = process.env.GEMINI_STYLIST_MODEL ?? 'gemini-3.1-flash-lite'
      if (!/^[a-z0-9][a-z0-9.-]{0,79}$/i.test(providerModel)) { metrics.aiPath('invalid_model'); return respond({ error: 'Stylist provider configuration unavailable' }, 503, 'configuration_error') }
      const claim = await beginStylistAi(user.id, requestId, fingerprint, providerModel)
      if (claim.status === 'busy') { metrics.aiPath('busy'); return respond({ error: 'A styling request is still processing. Try again shortly.', code: 'STYLIST_BUSY' }, 409, 'busy') }
      if (claim.status === 'conflict') { metrics.aiPath('conflict'); return respond({ error: 'Request identifier was already used for different inputs.', code: 'STYLIST_KEY_CONFLICT' }, 409, 'conflict') }
      if (claim.status === 'completed') { model = claim.intent; metrics.aiPath(model ? 'cached_intent' : 'cached_null_or_quota') }
      if (claim.status === 'claimed') {
        metrics.stage('provider')
        let usage: AiTelemetry = { status: 'network_error', input: null, output: null, thought: null, latency: 0 }
        model = await classifyWithGemini(question, {
          key, model: providerModel, onTelemetry: value => { usage = value },
        })
        metrics.aiPath(model ? 'provider_success' : 'provider_fallback')
        metrics.stage('ai_finish')
        await finishStylistAi(user.id, requestId, claim.token, model, providerModel, usage)
      }
    }
    metrics.stage('recommendation')
    const resolved = resolveIntent(question, model)
    const intent: Intent = daily ? { mode: 'shop', occasion: context.signals?.primaryOccasion === 'work-university' ? 'work' : context.signals?.primaryOccasion === 'going-out' ? 'going-out' : 'everyday', role: null, budget }
      : { ...resolved, budget: resolved.budget === null ? budget : budget === null ? resolved.budget : Math.min(resolved.budget, budget) }
    return respond({ ...recommendations(context, catalog, intent, collection, daily), source: model ? 'gemini' : 'rules' }, 200, 'success')
  } catch {
    return respond({ error: 'Could not load your styling recommendations. Try again.' }, 503, 'failure')
  }
}
