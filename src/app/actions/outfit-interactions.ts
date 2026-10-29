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
  const supabase = await createClient()
  const { data, error: authError } = await supabase.auth.getUser()
  if (authError || !data?.user) throw new Error('Not authenticated')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(outfitId)) throw new Error('Invalid outfit')
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || [...idempotencyKey].length > 200) throw new Error('Invalid idempotency key')

  // One transactional database RPC for recording canonical wear and its corresponding behavioral event atomically
  const { data: result, error } = await supabase.rpc('record_canonical_outfit_worn', {
    p_outfit_id: outfitId,
    p_worn_on: null,
    p_idempotency_key: idempotencyKey,
  })

  if (error || !result) {
    throw new Error('Could not record outfit interaction')
  }

  const res = result as {
    id?: string | null
    worn_on?: string | null
    interaction_id?: string | null
    replayed?: boolean
    undone?: boolean
  }

  return {
    interactionId: res.interaction_id ?? '',
    wearRecordId: res.id ?? null,
    wornOn: res.worn_on ?? null,
    replayed: res.replayed ?? false,
    undone: res.undone ?? false,
  }
}

export async function recordOutfitNotToday(outfitId: string, idempotencyKey: string) {
  return recordInteraction(outfitId, 'outfit_not_today', idempotencyKey)
}
