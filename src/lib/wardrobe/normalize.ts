export const WARDROBE_CATEGORIES = ['top', 'bottom', 'one_piece', 'footwear', 'outerwear', 'accessory'] as const
export type WardrobeCategory = (typeof WARDROBE_CATEGORIES)[number]
export type WardrobeLayerRole = 'base_layer' | 'bottom' | 'one_piece' | 'footwear' | 'outerwear' | 'accessory'
export type NormalizedWardrobeClassification = { category: WardrobeCategory; layer_role: WardrobeLayerRole }

export const SUBCATEGORY_MAP: Partial<Record<WardrobeCategory, readonly string[]>> = {
  top: ['t-shirt', 'polo', 'button-up', 'sweater'],
  bottom: ['jeans', 'trousers', 'shorts', 'skirt'],
  one_piece: ['dress', 'mini dress', 'midi dress', 'maxi dress', 'shirt dress', 'jumpsuit', 'romper', 'gown'],
  footwear: ['sneakers', 'boots', 'loafers', 'sandals'],
  outerwear: ['jacket', 'coat', 'blazer'],
  accessory: ['bag', 'hat', 'jewelry'],
}

const CATEGORY_TO_ROLE: Record<WardrobeCategory, WardrobeLayerRole> = {
  top: 'base_layer', bottom: 'bottom', one_piece: 'one_piece', footwear: 'footwear', outerwear: 'outerwear', accessory: 'accessory',
}
const ROLE_TO_CATEGORY: Record<WardrobeLayerRole, WardrobeCategory> = {
  base_layer: 'top', bottom: 'bottom', one_piece: 'one_piece', footwear: 'footwear', outerwear: 'outerwear', accessory: 'accessory',
}
const ROLE_ALIASES: Record<string, WardrobeLayerRole> = {
  base_layer: 'base_layer', base: 'base_layer', top: 'base_layer', bottom: 'bottom', one_piece: 'one_piece',
  dress: 'one_piece', jumpsuit: 'one_piece', romper: 'one_piece', footwear: 'footwear',
  shoe: 'footwear', outerwear: 'outerwear', outer_layer: 'outerwear', accessory: 'accessory',
}

function canonicalRole(value: string | null | undefined) { return ROLE_ALIASES[value?.trim().toLowerCase() ?? ''] }
function categoryFromText(text: string): WardrobeCategory | undefined {
  if (text.includes('dress') || text.includes('jumpsuit') || text.includes('romper') || text.includes('gown')) return 'one_piece'
  if (text.includes('shoe') || text.includes('footwear') || text.includes('sneaker') || text.includes('boot') || text.includes('loafer')) return 'footwear'
  if (text.includes('outerwear') || text.includes('outer wear') || text.includes('outer_layer') || text.includes('outer layer') || text.includes('jacket') || text.includes('coat') || text.includes('blazer')) return 'outerwear'
  if (text.includes('bottom') || text.includes('pant') || text.includes('trouser') || text.includes('skirt') || text.includes('jean') || text.includes('short')) return 'bottom'
  if (text.includes('top') || text.includes('shirt') || text.includes('blouse') || text.includes('tee') || text.includes('sweater')) return 'top'
}

/** Derive the selection category and engine role from one consistent input. */
export function normalizeWardrobeItem(item: { category?: string | null; subcategory?: string | null; display_name?: string | null; layer_role?: string | null }): NormalizedWardrobeClassification {
  const explicitCategory = item.category?.trim().toLowerCase()
  if (explicitCategory && WARDROBE_CATEGORIES.includes(explicitCategory as WardrobeCategory)) {
    const category = explicitCategory as WardrobeCategory
    return { category, layer_role: CATEGORY_TO_ROLE[category] }
  }
  const text = [item.subcategory, item.display_name, item.layer_role].filter(Boolean).join(' ').toLowerCase()
  const role = canonicalRole(item.layer_role)
  const category = categoryFromText(text) ?? (role ? ROLE_TO_CATEGORY[role] : 'accessory')
  return { category, layer_role: CATEGORY_TO_ROLE[category] }
}
