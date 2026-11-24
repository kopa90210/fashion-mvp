import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { parseIntent, type Intent } from './intent'

export type StylistQuota = 'api_hourly' | 'gemini_daily'

function quotaClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Stylist quota configuration unavailable')

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

/** API quota. AI callers must use beginStylistAi for idempotency and concurrency. */
export async function reserveStylistQuota(userId: string, quota: StylistQuota): Promise<boolean> {
  const client = quotaClient()
  // Do not retry an ambiguous reservation: the database may have committed it.
  const { data, error } = await client.rpc('reserve_stylist_quota', {
    p_user_id: userId,
    p_quota_type: quota,
  }).abortSignal(AbortSignal.timeout(3_000))
  if (error || typeof data !== 'boolean') throw new Error('Stylist quota unavailable')
  return data
}

export type AiClaim =
  | { status: 'claimed'; token: string }
  | { status: 'completed'; intent: Intent | null }
  | { status: 'busy' | 'conflict' }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function beginStylistAi(userId: string, requestId: string, fingerprint: string): Promise<AiClaim> {
  const { data, error } = await quotaClient().rpc('begin_stylist_ai', {
    p_user_id: userId, p_request_id: requestId, p_fingerprint: fingerprint,
  }).abortSignal(AbortSignal.timeout(3_000))
  if (error || !data || typeof data !== 'object') throw new Error('Stylist AI claim unavailable')
  if (data.status === 'claimed' && typeof data.token === 'string' && uuid.test(data.token)) {
    return { status: 'claimed', token: data.token }
  }
  if (data.status === 'busy' || data.status === 'conflict') return { status: data.status }
  if (data.status === 'completed') {
    if (data.intent === null) return { status: 'completed', intent: null }
    const intent = parseIntent(data.intent)
    if (intent) return { status: 'completed', intent }
  }
  throw new Error('Stylist AI claim unavailable')
}

export async function finishStylistAi(userId: string, requestId: string, token: string, intent: Intent | null): Promise<void> {
  const { data, error } = await quotaClient().rpc('finish_stylist_ai', {
    p_user_id: userId, p_request_id: requestId, p_token: token, p_intent: intent,
  }).abortSignal(AbortSignal.timeout(3_000))
  if (error || data !== true) throw new Error('Stylist AI completion unavailable')
}
