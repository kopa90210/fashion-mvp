'use server'

import { createClient } from '@/src/lib/supabase/server'

async function recordInteraction(outfitId: string, eventType: 'outfit_worn' | 'outfit_not_today', idempotencyKey: string) {
  const supabase = await createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  if (authError || !data?.user) throw new Error('Not authenticated')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(outfitId)) throw new Error('Invalid outfit')
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || [...idempotencyKey].length > 200) throw new Error('Invalid idempotency key')
  const { data: interactionId, error } = await supabase.rpc('record_outfit_interaction', {
    p_outfit_id: outfitId, p_event_type: eventType, p_idempotency_key: idempotencyKey, p_context_snapshot: {},
  })
  if (error || typeof interactionId !== 'string') throw new Error('Could not record outfit interaction')
  return { interactionId }
}

export async function recordOutfitWorn(outfitId: string, idempotencyKey: string) {
  return recordInteraction(outfitId, 'outfit_worn', idempotencyKey)
}

export async function recordOutfitNotToday(outfitId: string, idempotencyKey: string) {
  return recordInteraction(outfitId, 'outfit_not_today', idempotencyKey)
}
