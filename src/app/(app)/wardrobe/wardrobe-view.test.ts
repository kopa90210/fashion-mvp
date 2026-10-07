import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserWardrobeItem } from '@/src/app/actions/wardrobe'
import { WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'
import { filterOptions, filterWardrobe, knownBrand, primaryColor, styleTags, type WardrobeFilters } from './wardrobe-view'

const mocks = vi.hoisted(() => ({ getUserWardrobeItems: vi.fn(), getItemIntelligence: vi.fn(), notFound: vi.fn(() => { throw new Error('NOT_FOUND') }) }))
vi.mock('./[itemId]/item-intelligence', () => ({ getItemIntelligence: mocks.getItemIntelligence }))
vi.mock('@/src/app/actions/wardrobe', () => ({ ...mocks, confirmDraftItem: vi.fn(), discardDraftItem: vi.fn(), removeWardrobeItem: vi.fn(), replaceWardrobeItemPhoto: vi.fn(), updateWardrobeItemAttributes: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: mocks.notFound, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }))
vi.mock('next/image', () => ({ default: ({ src, alt, className }: React.ComponentProps<'img'>) => React.createElement('img', { src, alt, className }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }))
vi.mock('@/components/ui/button', () => ({ Button: ({ children, variant, ...props }: React.ComponentProps<'button'> & { variant?: string }) => React.createElement('button', { ...props, 'data-variant': variant }, children) }))
vi.mock('@/src/components/wardrobe/ItemEditor', () => ({ default: () => null }))
vi.mock('@/src/app/(app)/wishlist/WishlistScreen', () => ({ default: () => null }))
vi.mock('./add/PhotoUploadForm', () => ({ default: () => null }))
import WardrobeScreen from './WardrobeScreen'
import WardrobeItemPage from './[itemId]/page'
import WardrobeItemScreen from './[itemId]/WardrobeItemScreen'

const defaults: WardrobeFilters = { search: '', category: 'all', subcategory: '', color: '', style: '', sort: 'newest' }
function item(id: string, overrides: Partial<UserWardrobeItem> = {}): UserWardrobeItem {
  return { id, category: 'top', subcategory: 'linen shirt', brand: 'Arket', display_name: 'Linen shirt', image_url: '/shirt.png', color: { primary: 'Ivory' }, style_tags: { minimal: 0.8 }, fit: {}, layer_role: 'base_layer', quantity: 1, added_at: '2026-10-01', status: 'confirmed', ...overrides }
}
const items = [item('shirt'), item('jeans', { category: 'bottom', subcategory: 'straight jeans', display_name: 'Blue jeans', brand: null, color: { primary: 'Blue' }, style_tags: { casual: 1 }, added_at: '2026-10-02' })]
const render = (pieces = items, photos: Array<{ id: string; status: string; createdAt: string }> = [], drafts: UserWardrobeItem[] = []) => renderToStaticMarkup(React.createElement(WardrobeScreen, { items: pieces, outfitPhotos: photos, drafts, wishlistItems: [], categories: WARDROBE_CATEGORIES }))

beforeEach(() => vi.clearAllMocks())

describe('wardrobe browsing', () => {
  it.each(['linen', 'ARKET', 'shirt', 'ivory'])('searches supported wardrobe metadata for %s', (search) => {
    expect(filterWardrobe(items, { ...defaults, search }).map((piece) => piece.id)).toEqual(['shirt'])
  })
  it('combines category, subcategory, primary color, style and search', () => {
    expect(filterWardrobe(items, { ...defaults, category: 'top', subcategory: 'LINEN SHIRT', color: 'ivory', style: 'MINIMAL', search: 'arket' }).map((piece) => piece.id)).toEqual(['shirt'])
    expect(filterWardrobe(items, { ...defaults, category: 'bottom', color: 'ivory' })).toEqual([])
  })
  it('applies subcategory independently of a category tab', () => {
    expect(filterWardrobe(items, { ...defaults, subcategory: 'straight jeans' }).map((piece) => piece.id)).toEqual(['jeans'])
  })
  it('supports newest, oldest and alphabetical ordering without mutating its input', () => {
    expect(filterWardrobe(items, defaults).map((piece) => piece.id)).toEqual(['jeans', 'shirt'])
    expect(filterWardrobe(items, { ...defaults, sort: 'oldest' }).map((piece) => piece.id)).toEqual(['shirt', 'jeans'])
    expect(filterWardrobe(items, { ...defaults, sort: 'az' }).map((piece) => piece.id)).toEqual(['jeans', 'shirt'])
    expect(items[0].id).toBe('shirt')
  })
  it('excludes draft and rejected pieces from browsing and filter choices', () => {
    const pool = [...items, item('draft', { status: 'draft', color: { primary: 'Red' } }), item('rejected', { status: 'rejected' })]
    expect(filterWardrobe(pool, defaults)).toHaveLength(2)
    expect(filterOptions(pool, 'all').colors).toEqual(['blue', 'ivory'])
  })
  it('derives real filter values, handles malformed attributes and ignores nonpositive style weights', () => {
    expect(filterOptions([item('one', { subcategory: 'oversized button-up', color: { primary: 'IVORY' }, style_tags: { minimal: 1, ignored: 0, negative: -1, invalid: NaN } }), item('two', { color: { primary: 'ivory' } })], 'top')).toEqual({ subcategories: ['linen shirt', 'oversized button-up'], colors: ['ivory'], styles: ['minimal'] })
    expect(primaryColor(item('bad', { color: 'raw' }))).toBe('')
    expect(styleTags(item('bad', { style_tags: null }))).toEqual([])
    expect(styleTags(item('array', { style_tags: ['casual', 4, ''] }))).toEqual(['casual'])
  })
  it.each([null, '', 'Unknown Brand', 'unknown', ' N/A ', 'none'])('does not display placeholder brand %s', (brand) => {
    expect(knownBrand(brand)).toBe('')
    expect(render([item('one', { brand })])).not.toContain('Unknown Brand')
  })
  it('renders ownership count, navigation cards, responsive columns and real controls', () => {
    const html = render()
    expect(html).toContain('Your wardrobe')
    expect(html).toContain('2 pieces')
    expect(html).toContain('Search your wardrobe')
    expect(html).toContain('href="/wardrobe/shirt"')
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('md:grid-cols-3')
    expect(html).toContain('lg:grid-cols-4')
    expect(html).toContain('object-contain')
    for (const label of ['All', 'Tops', 'Bottoms', 'Shoes', 'Layers', 'Accessories', 'Newest', 'Oldest', 'A–Z', 'Wishlist', 'Select']) expect(html).toContain(label)
    expect(html).not.toContain('Filtering is coming soon')
  })
  it('keeps upload sessions and drafts accessible outside the owned grid', () => {
    const html = render(items, [{ id: 'photo', status: 'detecting', createdAt: '2026-10-05' }], [item('draft', { status: 'draft' })])
    expect(html).toContain('Recent uploads')
    expect(html).toContain('/wardrobe/add/review/photo')
    expect(html).toContain('Review 1 pending piece')
    expect(html).not.toContain('href="/wardrobe/draft"')
  })
  it('offers the correct owned-wardrobe empty state', () => {
    expect(render([])).toContain('Add your first piece')
  })
})

describe('owned wardrobe detail navigation', () => {
  const id = '12345678-1234-1234-1234-123456789abc'
  it('renders a detail screen from the authenticated owned pool', async () => {
    mocks.getItemIntelligence.mockResolvedValue({ item: item(id), looks: [], matches: [], descriptors: [] })
    const page = await WardrobeItemPage({ params: Promise.resolve({ itemId: id }) })
    expect(page.type).toBe(WardrobeItemScreen)
    expect(page.props.item.id).toBe(id)
    const html = renderToStaticMarkup(page)
    expect(html).toContain('Edit details')
    expect(html).toContain('Replace photo')
    expect(html).not.toContain('Color JSON')
  })
  it('returns not-found for unavailable items', async () => {
    mocks.getItemIntelligence.mockResolvedValue(null)
    await expect(WardrobeItemPage({ params: Promise.resolve({ itemId: id }) })).rejects.toThrow('NOT_FOUND')
  })
  it('rejects malformed IDs before reading wardrobe data', async () => {
    await expect(WardrobeItemPage({ params: Promise.resolve({ itemId: 'bad-id' }) })).rejects.toThrow('NOT_FOUND')
    expect(mocks.getItemIntelligence).not.toHaveBeenCalled()
  })
})
