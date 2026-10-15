import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { completionCopy, DEFAULT_PROCESSING_SUPPORT, LONG_PROCESSING_SUPPORT, processingFailed, processingMessage, processingSupport, reviewComplete, reviewPieces, type ReviewGarment } from './review-flow'
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
  it('moves only an added piece out of the remaining review list', () => {
    const result = reviewPieces(initial.garments, ['shirt'])
    expect([...result.main, ...result.accessories].map((item) => item.id)).not.toContain('shirt')
    expect(result.main.map((item) => item.id)).toEqual(['trousers', 'shoes', 'coat'])
    expect(result.accessories.map((item) => item.id)).toEqual(['bag'])
  })
  it('moves only a skipped piece out of the remaining review list', () => {
    const result = reviewPieces(initial.garments, ['trousers'])
    expect([...result.main, ...result.accessories].map((item) => item.id)).not.toContain('trousers')
    expect(result.main.map((item) => item.id)).toEqual(['shirt', 'shoes', 'coat'])
    expect(result.accessories.map((item) => item.id)).toEqual(['bag'])
  })
  it('retains unclassified pieces for correction before accessories', () => {
    expect(reviewPieces([garment('unknown', null), garment('bag', 'accessory')], []).main[0].id).toBe('unknown')
  })
  it.each([
    [null, 'Your photo is in line'], ['queued', 'Your photo is in line'],
    ['running', 'Finding your pieces'], ['retry_wait', 'Still working on your photo'],
  ])('uses friendly %s processing copy without exposing garments early', (jobStatus, message) => {
    expect(processingMessage(jobStatus)).toBe(message)
    const html = render({ ...initial, startedAt: new Date().toISOString(), status: 'detecting', jobStatus })
    expect(html).toContain(message)
    expect(html).toContain('Preparing your wardrobe')
    expect(html).toContain('Photo uploaded')
    expect(html).toContain('Finding visible pieces')
    expect(html).toContain('Preparing pieces for review')
    expect(html).toContain('your photo will keep processing')
    expect(html).toContain('href="/wardrobe"')
    expect(html).toContain('href="/wardrobe/add"')
    expect(html).not.toContain('Add to wardrobe')
  })
  it('uses calm long-running copy without treating processing as failed', () => {
    const startedAt = '2026-10-15T10:00:00.000Z'
    expect(processingSupport(startedAt, Date.parse(startedAt) + 121_000)).toBe(LONG_PROCESSING_SUPPORT)
    expect(processingSupport(startedAt, Date.parse(startedAt) + 30_000)).toBe(DEFAULT_PROCESSING_SUPPORT)
    expect(processingFailed('detecting', 'running')).toBe(false)
    const html = render({ ...initial, startedAt: new Date(Date.now() - 121_000).toISOString(), status: 'detecting', jobStatus: 'running' })
    expect(html).toContain(LONG_PROCESSING_SUPPORT)
    expect(html).not.toContain('We couldn’t prepare this photo')
  })
  it('does not show processing copy after completion', () => {
    const html = render(initial)
    expect(html).not.toContain('Preparing your wardrobe')
    expect(html).not.toContain('Your photo is in line')
    expect(html).not.toContain('your photo will keep processing')
  })
  it.each([
    [{ status: 'failed' as const, jobStatus: 'running' }, 'source failure'],
    [{ status: 'detecting' as const, jobStatus: 'dead_letter' }, 'terminal job'],
  ])('shows safe retry language for %s', ({ status, jobStatus }, _caseName) => {
    expect(processingFailed(status, jobStatus)).toBe(true)
    const html = render({ ...initial, status, jobStatus })
    expect(html).toContain('We couldn’t prepare this photo')
    expect(html).toContain('Try another clear photo where the clothes are easy to see.')
    expect(html).toContain('Upload another photo')
    expect(html).toContain('Back to wardrobe')
    expect(html).not.toContain('dead_letter')
  })
  it('shows one main garment, progress and a plain details sheet', () => {
    const html = render(initial)
    expect(html).toContain('1 of 5')
    expect(html).toContain('/shirt.png')
    expect(html).not.toContain('/coat.png')
    expect(html).not.toContain('/bag.png')
    expect(html).toContain('Review piece')
    expect(html).toContain('shirt</h1>')
    expect(html).toContain('Top · Blue')
    expect(html).toContain('Suggested by StyleGraph')
    expect(html).toContain('Subcategory')
    expect(html).toContain('Brand (optional)')
    expect(html).not.toContain('Unknown Brand')
    expect(html.indexOf('Add to wardrobe')).toBeLessThan(html.indexOf('Edit details'))
  })
  it('requires an explicit decision before reviewing accessories', () => {
    const html = render({ ...initial, detectedCount: 2, garments: [garment('bag', 'accessory'), garment('belt', 'accessory')] })
    expect(html).toContain('Main pieces reviewed')
    expect(html).toContain('We also found 2 accessories. Review them now or come back later.')
    expect(html).toContain('Review accessories')
    expect(html).toContain('Finish for now')
    expect(html).not.toContain('Add to wardrobe')
  })
  it('offers a recoverable empty state and hands completed review into Today', () => {
    expect(render({ ...initial, detectedCount: 0, garments: [] })).toContain('No clear pieces found')
    const complete = render({ ...initial, garments: [] })
    expect(complete).toContain('Your wardrobe is updated')
    expect(complete).toContain('We saved the pieces you chose. StyleGraph can now use them when building outfits.')
    expect(complete).toContain('href="/outfits"')
    expect(complete).toContain('See today’s outfit')
    expect(complete).toContain('View wardrobe')
  })
  it('keeps unfinished accessories out of the completed-wardrobe claim', () => {
    expect(reviewComplete(false, 2, 2)).toBe(false)
    expect(reviewComplete(true, 2, 2)).toBe(true)
    expect(reviewComplete(false, 2, 0)).toBe(true)
    expect(completionCopy(2)).toEqual({
      title: 'Your choices are saved',
      supporting: 'You can come back to the remaining pieces later.',
    })
    expect(completionCopy(0)).toEqual({
      title: 'Your wardrobe is updated',
      supporting: 'We saved the pieces you chose. StyleGraph can now use them when building outfits.',
    })
  })
  it('preserves the optional alternate image choice without technical copy', () => {
    const html = render({ ...initial, garments: [{ ...garment('shirt', 'top'), reconstructedImageUrl: '/alternate.png' }] })
    expect(html).toContain('See alternate view')
    expect(html).toContain('/shirt.png')
    expect(html).not.toContain('reconstructed')
  })
})
