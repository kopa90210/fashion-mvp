import 'server-only'
import { createClient } from '@supabase/supabase-js'

export type StylistQuota = 'api_hourly' | 'gemini_daily'

/** Only call with a user ID verified by the server's auth client. */
export async function reserveStylistQuota(userId: string, quota: StylistQuota): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Stylist quota configuration unavailable')

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  // Do not retry an ambiguous reservation: the database may have committed it.
  const { data, error } = await client.rpc('reserve_stylist_quota', {
    p_user_id: userId,
    p_quota_type: quota,
  }).abortSignal(AbortSignal.timeout(3_000))
  if (error || typeof data !== 'boolean') throw new Error('Stylist quota unavailable')
  return data
}
