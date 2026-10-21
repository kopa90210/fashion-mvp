import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyOutfit } from '@/src/app/actions/outfit'

const mocks = vi.hoisted(() => ({
  candidates: vi.fn(), create: vi.fn(), clicks: new Map<string, () => void>(),
}))
vi.mock('@/src/app/actions/outfit-swaps', () => ({
  getSwapCandidates: mocks.candidates,
  createSwappedOutfit: mocks.create,
}))
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: React.ComponentProps<'img'>) => React.createElement('img', { src, alt, ...props }),
}))
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: React.ComponentProps<'button'>) => {
    const label = React.Children.toArray(children).filter((child) => typeof child === 'string').join('')
    if (onClick) mocks.clicks.set(label, () => onClick({} as React.MouseEvent<HTMLButtonElement>))
    return React.createElement('button', props, children)
  },
}))

import {
  SwapPanel, commitSwap, derivedSwappedOutfit, fetchSwapCandidates, initialSwapState,
  swapIdempotencyKey, swapPreviewItems, swapReducer, type SwapState,
} from './SwapOutfitFlow'
import type { SwapCandidate } from '@/src/app/actions/outfit-swaps'

const shirt = { id: 'shirt', display_name: 'Linen shirt', image_url: '/shirt.png', layer_role: 'base_layer' as const, style_tags: { minimal: 0.8 } }
const trousers = { id: 'trousers', display_name: 'Trousers', image_url: '/trousers.png', layer_role: 'bottom' as const, style_tags: { minimal: 0.7 } }
const shoes = { id: 'shoes', display_name: 'Sneakers', image_url: '/shoes.png', layer_role: 'footwear' as const, style_tags: { minimal: 0.6 } }
const replacement = { id: 'replacement', display_name: 'Oxford shirt', image_url: '/replacement.png', layer_role: 'base_layer' as const, style_tags: { minimal: 0.9 } }
const outfit: DailyOutfit = { id: 'parent-outfit', items: [shirt, trousers, shoes], score: 0.7, vector: { minimal: 0.8 }, reasons: ['Stored parent reason'] }
const candidate: SwapCandidate = { replacement, category: 'top', subcategory: 'button-up', descriptor: 'Button Up · Top', outfitScore: 0.8 }
const noop = () => undefined
const renderPanel = (state: SwapState) => renderToStaticMarkup(React.createElement(SwapPanel, {
  state, outfit, onSelect: noop, onRetry: noop, onPreview: noop, onChooseAnother: noop, onConfirm: noop,
}))

beforeEach(() => {
  vi.clearAllMocks(); mocks.clicks.clear()
  mocks.candidates.mockResolvedValue([candidate])
  mocks.create.mockResolvedValue({ outfitId: 'child-outfit' })
})

describe('Today swap flow state', () => {
  it('opens at the piece prompt and moves from item selection to loaded candidates', () => {
    const opened = swapReducer(initialSwapState, { type: 'open' })
    expect(opened).toMatchObject({ open: true, stage: 'select' })
    const selected = swapReducer(opened, { type: 'select', item: shirt })
    expect(selected).toMatchObject({ stage: 'candidates', selected: shirt, loading: true })
    const loaded = swapReducer(selected, { type: 'loaded', candidates: [candidate] })
    expect(loaded).toMatchObject({ loading: false, candidates: [candidate] })
    expect(renderPanel(opened)).toContain('What would you change?')
    expect(renderPanel(opened)).toContain('aria-label="Swap Linen shirt"')
  })

  it('recovers from candidate failures and retains the selected piece for retry', () => {
    const selected = swapReducer(swapReducer(initialSwapState, { type: 'open' }), { type: 'select', item: shoes })
    const failed = swapReducer(selected, { type: 'load_failed' })
    expect(renderPanel(failed)).toContain('Couldn&#x27;t load alternatives. Try again.')
    const retrying = swapReducer(failed, { type: 'retry' })
    expect(retrying).toMatchObject({ selected: shoes, loading: true, loadError: false })
  })
})

describe('Today swap presentation and actions', () => {
  it('shows the current piece first and renders consumer candidate metadata without a score percentage', () => {
    const state = { ...initialSwapState, open: true, stage: 'candidates' as const, selected: shirt, candidates: [candidate] }
    const html = renderPanel(state)
    expect(html.indexOf('Current piece')).toBeLessThan(html.indexOf('Try instead'))
    expect(html).toContain('Oxford shirt')
    expect(html).toContain('Button Up · Top')
    expect(html).not.toContain('80%')
    expect(html).not.toContain('0.8')
    expect(html).toContain('aria-label="Preview Oxford shirt instead of Linen shirt"')
  })

  it('previews the replacement in an Updated look while leaving the input outfit untouched', () => {
    const items = swapPreviewItems(outfit.items, shirt.id, replacement)
    expect(items.map((item) => item.id)).toEqual(['replacement', 'trousers', 'shoes'])
    expect(outfit.items.map((item) => item.id)).toEqual(['shirt', 'trousers', 'shoes'])
    expect(derivedSwappedOutfit(outfit, 'child-outfit', items, candidate.outfitScore)).toMatchObject({
      id: 'child-outfit', items, score: candidate.outfitScore, reasons: [], vector: outfit.vector,
    })
    const html = renderPanel({ ...initialSwapState, open: true, stage: 'preview', selected: shirt, preview: candidate })
    expect(html).toContain('Updated look')
    expect(html).toContain('Oxford shirt')
    expect(html).not.toContain('Linen shirt')
    expect(html).toContain('Use this look')
    expect(html).toContain('Choose another')
  })

  it('loads exactly three candidates and confirms through the transactional action with a deterministic key', async () => {
    await expect(fetchSwapCandidates(outfit.id, shirt.id)).resolves.toEqual([candidate])
    expect(mocks.candidates).toHaveBeenCalledExactlyOnceWith(outfit.id, shirt.id, 3)
    await expect(commitSwap(outfit.id, shirt.id, replacement.id)).resolves.toEqual({ outfitId: 'child-outfit' })
    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(
      outfit.id, shirt.id, replacement.id, swapIdempotencyKey(outfit.id, shirt.id, replacement.id),
    )
  })

  it('keeps a failed persistence preview available and offers an empty-candidate route back', () => {
    const failedPreview = renderPanel({ ...initialSwapState, open: true, stage: 'preview', selected: shirt, preview: candidate, saveError: true })
    expect(failedPreview).toContain('Couldn&#x27;t save this look. Try again.')
    expect(failedPreview).toContain('Use this look')
    const empty = renderPanel({ ...initialSwapState, open: true, stage: 'candidates', selected: shirt, candidates: [] })
    expect(empty).toContain('No alternatives for this piece yet.')
    expect(empty).toContain('Choose another piece')
  })
})
