import type { WardrobeItem } from './engine'
import type { StyleVector } from '@/src/lib/quiz/scoring'

export type GeneratedDailyOutfit = {
  item_ids: string[]
  reasoning: string[]
  styling_tip: string | null
  confidence: number
  source: 'daily_ai' | 'daily_fallback'
}

/** Called by the daily server action with the authenticated user's wardrobe. */
export async function generateDailyOutfit(
  userId: string, dna: StyleVector, items: WardrobeItem[],
): Promise<GeneratedDailyOutfit | null> {
  const baseUrl = process.env.AI_OUTFIT_SERVICE_URL?.trim()
  if (!baseUrl || items.length === 0) return null
  try {
    const configured = Number(process.env.AI_OUTFIT_SERVICE_TIMEOUT_MS ?? 15000)
    const timeout = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 60000) : 15000
    const response = await fetch(baseUrl.replace(/\/+$/, '') + '/generate-outfit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, fashion_dna: dna, wardrobe_items: items }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeout),
    })
    if (!response.ok) throw new Error('HTTP ' + response.status)
    const value: unknown = await response.json()
    if (!value || typeof value !== 'object') throw new Error('Invalid response')
    const result = value as Record<string, unknown>
    const ids = result.item_ids
    if (!Array.isArray(ids) || ids.length < 3 || !ids.every((id) => typeof id === 'string')
      || new Set(ids).size !== ids.length
      || !Array.isArray(result.reasoning) || !result.reasoning.every((reason) => typeof reason === 'string')
      || (result.styling_tip != null && typeof result.styling_tip !== 'string')
      || typeof result.confidence !== 'number' || !Number.isFinite(result.confidence)
      || result.confidence < 0 || result.confidence > 1
      || (result.source !== 'daily_ai' && result.source !== 'daily_fallback')) {
      throw new Error('Invalid response fields')
    }
    const pool = new Map(items.map((item) => [item.id, item]))
    const selected = ids.map((id) => pool.get(id))
    if (selected.some((item) => !item)) throw new Error('Unknown wardrobe item')
    const roles = selected.map((item) => item!.layer_role)
    if (!['base_layer', 'bottom', 'footwear'].every((role) => roles.filter((r) => r === role).length === 1)
      || new Set(roles).size !== roles.length
      || roles.some((role) => !['base_layer', 'bottom', 'footwear', 'outerwear', 'accessory'].includes(role))) {
      throw new Error('Invalid outfit roles')
    }
    return { ...result, styling_tip: result.styling_tip ?? null } as GeneratedDailyOutfit
  } catch (error) {
    console.warn('[outfit] AI service failed; using local engine:', error instanceof Error ? error.message : 'Unknown error')
    return null
  }
}
