import type { LayerRole, WardrobeItem } from '@/src/lib/outfit/engine'
import { normalizeWardrobeItem } from '@/src/lib/wardrobe/normalize'
import type { ProfileGarment } from '@/src/lib/profile/types'

export type RawGarmentInput = {
  id?: string | null
  wardrobe_item_id?: string | null
  displayName?: string | null
  display_name?: string | null
  category?: string | null
  subcategory?: string | null
  layerRole?: string | null
  layer_role?: string | null
  imageUrl?: string | null
  image_url?: string | null
  mediaAssetId?: string | null
  media_asset_id?: string | null
  slot?: string | null
  position?: number | null
  isRetired?: boolean | null
  is_retired?: boolean | null
  isMissing?: boolean | null
  is_missing?: boolean | null
}

export type RawOutfitInput = {
  id?: string | null
  items?: RawGarmentInput[] | null
  garments?: RawGarmentInput[] | null
  source?: string | null
  status?: string | null
  createdAt?: string | null
  created_at?: string | null
  scheduledFor?: string | null
  scheduled_for?: string | null
  stylingTip?: string | null
  styling_tip?: string | null
  reasons?: string[] | null
  reasoning?: string[] | null
}

/**
 * Normalizes any raw garment or snapshot row into a canonical ProfileGarment.
 * Reconciles camelCase vs snake_case (imageUrl vs image_url, layerRole vs layer_role),
 * canonical layer roles, and missing media flags.
 */
export function adaptProfileGarment(
  raw: RawGarmentInput,
  index = 0,
): ProfileGarment {
  const id = String(raw.id ?? raw.wardrobe_item_id ?? `garment-${index}`)
  const displayName =
    raw.displayName ??
    raw.display_name ??
    raw.subcategory ??
    raw.category ??
    'Wardrobe piece'
  const imageUrl = raw.imageUrl ?? raw.image_url ?? null
  const rawRole =
    raw.layerRole ??
    raw.layer_role ??
    raw.slot ??
    raw.category ??
    'base_layer'

  const normalized = normalizeWardrobeItem({
    category: raw.category,
    subcategory: raw.subcategory,
    display_name: displayName,
    layer_role: rawRole,
  })

  const slot = String(raw.slot ?? normalized.layer_role)
  const isRetired = Boolean(raw.isRetired ?? raw.is_retired)
  const hasMediaRef = Boolean(raw.mediaAssetId ?? raw.media_asset_id)
  const isMissing = Boolean(raw.isMissing ?? raw.is_missing ?? (!imageUrl && hasMediaRef))

  return {
    id,
    displayName,
    category: normalized.category,
    layerRole: normalized.layer_role,
    imageUrl,
    slot,
    position: typeof raw.position === 'number' ? raw.position : index,
    isRetired,
    isMissing,
  }
}

/**
 * Extracts normalized ProfileGarment list from an outfit whether stored under `items` or `garments`.
 */
export function extractOutfitGarments(
  outfit: RawOutfitInput | null | undefined,
): ProfileGarment[] {
  if (!outfit) return []
  const rawList = Array.isArray(outfit.items)
    ? outfit.items
    : Array.isArray(outfit.garments)
      ? outfit.garments
      : []
  return rawList.map((item, idx) => adaptProfileGarment(item, idx))
}

/**
 * Bridges ProfileGarment list to the WardrobeItem format required by OutfitCanvas / FlatLay.
 * Ensures layer_role is always a valid LayerRole, image_url is cleanly propagated,
 * and display_name is present.
 */
export function profileGarmentsToWardrobeItems(
  items: Array<ProfileGarment | RawGarmentInput> | null | undefined,
): WardrobeItem[] {
  if (!Array.isArray(items)) return []
  return items.map((item, idx) => {
    const adapted = adaptProfileGarment(item, idx)
    return {
      id: adapted.id,
      display_name: adapted.displayName,
      layer_role: (adapted.layerRole as LayerRole) ?? 'base_layer',
      image_url: adapted.imageUrl,
      style_tags: {},
    }
  })
}
