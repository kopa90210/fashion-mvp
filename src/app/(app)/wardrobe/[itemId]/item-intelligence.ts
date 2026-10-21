import 'server-only'
import { createClient } from '@/src/lib/supabase/server'
import { getUserWardrobeItems, type UserWardrobeItem } from '@/src/app/actions/wardrobe'
import { recommendOutfits } from '@/src/lib/outfit/engine'
import { normalizeWardrobeItem } from '@/src/lib/wardrobe/normalize'
import { TAG_LABELS } from '@/src/lib/fashion-dna/labels'
import { itemDescriptor, itemName, knownBrand } from '../wardrobe-view'

export type LookPiece = { id: string; name: string; descriptor: string; imageUrl: string | null; brand: string }
export type ItemIntelligence = { item: UserWardrobeItem; descriptors: string[]; looks: LookPiece[][]; matches: LookPiece[] }

function numericVector(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([, weight]) => typeof weight === 'number' && Number.isFinite(weight) && weight >= 0 && weight <= 1))
}
function present(item: UserWardrobeItem): LookPiece {
  return { id: item.id, name: itemName(item), descriptor: itemDescriptor(item), imageUrl: item.image_url, brand: knownBrand(item.brand) }
}

export async function getItemIntelligence(itemId: string): Promise<ItemIntelligence | null> {
  const supabase = await createClient()
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth?.user) throw new Error('Not authenticated')
  const wardrobe = await getUserWardrobeItems()
  const item = wardrobe.find((piece) => piece.id === itemId)
  if (!item) return null
  const { data: dna, error } = await supabase.from('fashion_dna').select('vector').eq('user_id', auth.user.id).maybeSingle()
  if (error) throw new Error('Could not load outfit ideas')
  const ranked = recommendOutfits(wardrobe.map((piece) => ({
    id: piece.id, display_name: itemName(piece), image_url: piece.image_url,
    layer_role: normalizeWardrobeItem(piece).layer_role, style_tags: numericVector(piece.style_tags),
  })), numericVector(dna?.vector), { topN: 3, anchorItemId: item.id })
  const byId = new Map(wardrobe.map((piece) => [piece.id, piece]))
  const looks = ranked.map((look) => look.items.map((piece) => present(byId.get(piece.id)!)))
  // Preserve best-look rank and slot order; never invent pairwise compatibility scores.
  const matches = [...new Map(looks.flat().filter((piece) => piece.id !== item.id).map((piece) => [piece.id, piece])).values()].slice(0, 6)
  const descriptors = Object.entries(numericVector(item.style_tags)).filter(([key, weight]) => TAG_LABELS[key] && weight > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([key]) => TAG_LABELS[key])
  return { item, looks, matches, descriptors }
}
