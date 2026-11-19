import 'server-only'
import type { createClient } from '@/src/lib/supabase/server'
import { readQuizSignals, type StyleVector } from '@/src/lib/quiz/scoring'
import { normalizeWardrobeItem } from '@/src/lib/wardrobe/normalize'
import type { WardrobeItem } from '@/src/lib/outfit/engine'
import type { StylistContext } from './recommend'

export async function loadStylistWardrobe(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<StylistContext> {
  const [closet, dna] = await Promise.all([
    supabase.from('user_wardrobe_items')
      .select('item_id, wardrobe_items!inner (id, display_name, category, subcategory, layer_role, style_tags, fit, formality_score)')
      .eq('user_id', userId).eq('wardrobe_items.status', 'confirmed').is('retired_at', null)
      .order('item_id').limit(250),
    supabase.from('fashion_dna').select('vector, quiz_signals').eq('user_id', userId).maybeSingle(),
  ])
  if (closet.error || dna.error) throw new Error('Stylist context unavailable')
  const items: WardrobeItem[] = (closet.data ?? []).flatMap(({ wardrobe_items }) => {
    const item = Array.isArray(wardrobe_items) ? wardrobe_items[0] : wardrobe_items
    if (!item || typeof item.display_name !== 'string') return []
    const role = normalizeWardrobeItem(item).layer_role
    if (!role) return []
    return [{ ...item, layer_role: role, image_url: null, style_tags: item.style_tags ?? {} }]
  })
  return { items, dna: (dna.data?.vector ?? {}) as StyleVector, signals: readQuizSignals(dna.data?.quiz_signals) }
}
