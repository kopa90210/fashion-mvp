import type { UserWardrobeItem } from '@/src/app/actions/wardrobe'

export const categoryLabels: Record<string, string> = { all: 'All', top: 'Tops', bottom: 'Bottoms', one_piece: 'Dresses', footwear: 'Shoes', outerwear: 'Layers', accessory: 'Accessories' }
export type WardrobeFilters = { search: string; category: string; subcategory: string; color: string; style: string; sort: 'newest' | 'oldest' | 'az' }
const normalized = (value: string) => value.trim().toLowerCase()

export function knownBrand(brand: string | null) {
  const value = brand?.trim() ?? ''
  return ['unknown', 'unknown brand', 'n/a', 'none'].includes(normalized(value)) ? '' : value
}

export function primaryColor(item: Pick<UserWardrobeItem, 'color'>) {
  const raw = item.color
  const value = raw && typeof raw === 'object' && 'primary' in raw && typeof raw.primary === 'string' ? raw.primary.trim() : ''
  return normalized(value) === 'unknown' ? '' : value
}

export function styleTags(item: Pick<UserWardrobeItem, 'style_tags'>): string[] {
  const raw = item.style_tags
  if (Array.isArray(raw)) return raw.filter((value): value is string => typeof value === 'string' && !!value.trim()).map((value) => value.trim())
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).filter(([, value]) => typeof value === 'number' && Number.isFinite(value) && value > 0).map(([key]) => key)
}

export function itemName(item: UserWardrobeItem) { return item.display_name?.trim() || item.subcategory?.trim() || 'Your piece' }
export function itemDescriptor(item: UserWardrobeItem) {
  return [item.subcategory?.trim() || categoryLabels[item.category ?? ''] || 'Clothing', primaryColor(item)].filter(Boolean).join(' · ')
}

export function filterWardrobe(items: UserWardrobeItem[], filters: WardrobeFilters) {
  const search = normalized(filters.search)
  const matches = (value: string, expected: string) => !expected || normalized(value) === normalized(expected)
  const date = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0
  return items.filter((item) => item.status === 'confirmed')
    .filter((item) => filters.category === 'all' || item.category === filters.category)
    .filter((item) => matches(item.subcategory ?? '', filters.subcategory) && matches(primaryColor(item), filters.color))
    .filter((item) => !filters.style || styleTags(item).some((tag) => matches(tag, filters.style)))
    .filter((item) => !search || [item.display_name, knownBrand(item.brand), item.subcategory, primaryColor(item)].some((value) => value && normalized(value).includes(search)))
    .sort((a, b) => filters.sort === 'az' ? itemName(a).localeCompare(itemName(b), 'en', { sensitivity: 'base' }) || a.id.localeCompare(b.id)
      : (filters.sort === 'oldest' ? date(a.added_at) - date(b.added_at) : date(b.added_at) - date(a.added_at)) || a.id.localeCompare(b.id))
}

export function filterOptions(items: UserWardrobeItem[], category: string) {
  const pool = items.filter((item) => item.status === 'confirmed' && (category === 'all' || item.category === category))
  const unique = (values: string[]) => [...new Set(values.map(normalized).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  return { subcategories: unique(pool.map((item) => item.subcategory ?? '')), colors: unique(pool.map(primaryColor)), styles: unique(pool.flatMap(styleTags)) }
}
