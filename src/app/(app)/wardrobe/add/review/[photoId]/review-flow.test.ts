import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { processingMessage, reviewPieces, type ReviewGarment } from './review-flow'
import type { OutfitPhotoReview } from '@/src/app/actions/wardrobe'

vi.mock('@/src/app/actions/wardrobe', () => ({
  confirmOutfitPhotoDraft: vi.fn(), discardDraftItem: vi.fn(),
  getOutfitPhotoReview: vi.fn(), updateWardrobeItemAttributes: vi.fn(),
}))
vi.mock('next/image', () => ({ default: ({ src, alt }: { src: string; alt: string }) => React.createElement('img', { src, alt }) }))
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.ComponentProps<'a'>) => React.createElement('a', props, children) }))
vi.mock('@/components/ui/button', () => ({ Button: ({ children, variant, ...props }: React.ComponentProps<'button'> & { variant?: string }) => React.createElement('button', { ...props, 'data-variant': variant }, children) }))
import ReviewOutfitScreen from './ReviewOutfitScreen'

const garment = (id: string, category: string | null): ReviewGarment => ({
  id, category, subcategory: null, displayName: id, brand: null, color: 'Blue',
  originalImageUrl: '/' + id + '.png', reconstructedImageUrl: null,
})
const initial: OutfitPhotoReview = {
  sourcePhotoId: 'photo', sourceImageUrl: '/outfit.png', startedAt: '2026-10-05',
  status: 'done', detectedCount: 5, jobStatus: 'completed',
  garments: [garment('bag', 'accessory'), garment('coat', 'outerwear'), garment('shoes', 'footwear'), garment('trousers', 'bottom'), garment('shirt', 'top')],
}
const render = (review: OutfitPhotoReview) => renderToStaticMarkup(React.createElement(ReviewOutfitScreen, { initial: review }))

describe('focused outfit review', () => {
  it('orders main pieces independently of extraction order and keeps accessories separate', () => {
    const result = reviewPieces(initial.garments, [])
    expect(result.main.map((item) => item.id)).toEqual(['shirt', 'trousers', 'shoes', 'coat'])
    expect(result.accessories.map((item) => item.id)).toEqual(['bag'])
    expect(initial.garments[0].id).toBe('bag')
  })
  it('filters handled drafts even if a stale poll returns them', () => {
    const result = reviewPieces(initial.garments, ['shirt', 'bag'])
    expect(result.main.map((item) => item.id)).toEqual(['trousers', 'shoes', 'coat'])
    expect(result.accessories).toEqual([])
  })
  it('retains unclassified pieces for correction before accessories', () => {
    expect(reviewPieces([garment('unknown', null), garment('bag', 'accessory')], []).main[0].id).toBe('unknown')
  })
  it.each([
    ['queued', 'Preparing your outfit'], ['running', 'Finding your pieces'],
    ['retry_wait', 'Still working — this is taking a little longer'],
  ])('uses friendly %s processing copy without exposing garments early', (jobStatus, message) => {
    expect(processingMessage(jobStatus)).toBe(message)
    const html = render({ ...initial, status: 'detecting', jobStatus })
    expect(html).toContain(message)
    expect(html).toContain('You can leave this page.')
    expect(html).not.toContain('Add to wardrobe')
  })
  it('shows one main garment, progress and a plain details sheet', () => {
    const html = render(initial)
    expect(html).toContain('5 pieces found')
    expect(html).toContain('1 of 5')
    expect(html).toContain('/shirt.png')
    expect(html).not.toContain('/coat.png')
    expect(html).not.toContain('/bag.png')
    expect(html).toContain('Subcategory')
    expect(html).toContain('Brand (optional)')
    expect(html).not.toContain('Unknown Brand')
  })
  it('requires an explicit decision before reviewing accessories', () => {
    const html = render({ ...initial, garments: [garment('bag', 'accessory')] })
    expect(html).toContain('Main pieces are ready')
    expect(html).toContain('Review accessories')
    expect(html).toContain('Finish')
    expect(html).not.toContain('Add to wardrobe')
  })
  it('offers a recoverable empty state and a reviewed state', () => {
    expect(render({ ...initial, detectedCount: 0, garments: [] })).toContain('No clear pieces found')
    expect(render({ ...initial, garments: [] })).toContain('All pieces reviewed')
  })
  it('preserves the optional alternate image choice without technical copy', () => {
    const html = render({ ...initial, garments: [{ ...garment('shirt', 'top'), reconstructedImageUrl: '/alternate.png' }] })
    expect(html).toContain('See alternate view')
    expect(html).toContain('/shirt.png')
    expect(html).not.toContain('reconstructed')
  })
})
