import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserWardrobeItem } from '@/src/app/actions/wardrobe'

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), wardrobe: vi.fn(), eq: vi.fn(), dna: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/src/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: (table: string) => {
  if (table !== 'fashion_dna') throw new Error('Unexpected table')
  return { select: () => ({ eq: (...args: unknown[]) => { mocks.eq(...args); return { maybeSingle: mocks.dna } } }) }
} }) }))
vi.mock('@/src/app/actions/wardrobe', () => ({ getUserWardrobeItems: mocks.wardrobe, removeWardrobeItem: vi.fn(), replaceWardrobeItemPhoto: vi.fn(), updateWardrobeItemAttributes: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock('next/image', () => ({ default: ({ src, alt }: React.ComponentProps<'img'>) => React.createElement('img', { src, alt }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }))
vi.mock('@/components/ui/button', () => ({ Button: ({ children, variant, ...props }: React.ComponentProps<'button'> & { variant?: string }) => React.createElement('button', { ...props, 'data-variant': variant }, children) }))
vi.mock('../add/PhotoUploadForm', () => ({ default: () => null }))
import { getItemIntelligence } from './item-intelligence'
import WardrobeItemScreen from './WardrobeItemScreen'

function piece(id: string, category: string): UserWardrobeItem {
  return { id, category, subcategory: 'linen', display_name: id, brand: null, image_url: '/private-preview.png', color: { primary: 'Ivory' }, style_tags: { minimal: 0.8, formal: 0.2, asset_id: 1 }, layer_role: null, fit: {}, status: 'confirmed', quantity: 1, added_at: '2026-10-05' }
}
const wardrobe = [piece('shirt', 'top'), piece('trousers', 'bottom'), piece('shoes', 'footwear'), piece('coat', 'outerwear'), piece('bag', 'accessory')]
beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'authenticated-user' } }, error: null })
  mocks.wardrobe.mockResolvedValue(wardrobe)
  mocks.dna.mockResolvedValue({ data: { vector: { minimal: 0.9, formal: 0.2 } }, error: null })
})

describe('owned item intelligence', () => {
  it('authenticates before wardrobe reads and rejects unauthenticated access', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(getItemIntelligence('shirt')).rejects.toThrow('Not authenticated')
    expect(mocks.wardrobe).not.toHaveBeenCalled()
    expect(mocks.dna).not.toHaveBeenCalled()
  })
  it('rejects foreign and curated anchors absent from the authenticated owned pool before reading DNA', async () => {
    expect(await getItemIntelligence('foreign-or-curated')).toBeNull()
    expect(mocks.dna).not.toHaveBeenCalled()
  })
  it.each(['shirt', 'trousers', 'shoes', 'coat', 'bag'])('anchors every ranked look to %s and derives unique matches only from those looks', async (id) => {
    const result = (await getItemIntelligence(id))!
    expect(mocks.eq).toHaveBeenCalledWith('user_id', 'authenticated-user')
    expect(result.looks.length).toBeGreaterThan(0)
    expect(result.looks.every((look) => look.some((item) => item.id === id))).toBe(true)
    const participants = new Set(result.looks.flat().map((item) => item.id))
    expect(result.matches.every((item) => item.id !== id && participants.has(item.id))).toBe(true)
    expect(new Set(result.matches.map((item) => item.id)).size).toBe(result.matches.length)
    expect(result.descriptors).toEqual(['Minimal', 'Polished'])
    expect(result.looks.flat().every((item) => !('layer_role' in item) && !('style_tags' in item))).toBe(true)
  })
  it('does not invent looks when required wardrobe roles are missing', async () => {
    mocks.wardrobe.mockResolvedValue([wardrobe[0]])
    const result = (await getItemIntelligence('shirt'))!
    expect(result.looks).toEqual([])
    expect(result.matches).toEqual([])
    const html = renderToStaticMarkup(React.createElement(WardrobeItemScreen, result))
    expect(html).toContain('Add a few more pieces to unlock outfit ideas.')
    expect(html).not.toContain('href="#looks-with-piece"')
  })
  it('handles missing DNA neutrally without calling an AI provider', async () => {
    mocks.dna.mockResolvedValue({ data: null, error: null })
    expect((await getItemIntelligence('shirt'))!.looks.length).toBeGreaterThan(0)
  })
  it('does not hide DNA read failures as an empty wardrobe', async () => {
    mocks.dna.mockResolvedValue({ data: null, error: { message: 'private exception body' } })
    await expect(getItemIntelligence('shirt')).rejects.toThrow('Could not load outfit ideas')
  })
  it('renders consumer sections, a functioning styling anchor and plain sheet fields without technical data', async () => {
    const result = (await getItemIntelligence('shirt'))!
    const html = renderToStaticMarkup(React.createElement(WardrobeItemScreen, result))
    for (const text of ['Looks with this piece', 'Best matches', 'Style this piece', 'Minimal', 'Edit details', 'Brand (optional)', 'Close details']) expect(html).toContain(text)
    expect(html).toContain('href="#looks-with-piece"')
    expect(html).toContain('<dialog')
    for (const text of ['Unknown Brand', 'Color JSON', 'layer_role', 'asset_id', 'model_confidence', 'source_photo_id', 'ai_run_id']) expect(html).not.toContain(text)
  })
})
