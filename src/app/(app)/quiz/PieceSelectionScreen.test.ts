import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import PieceSelectionScreen from './PieceSelectionScreen'
import { SELECTION_STEPS } from './selection-steps'
import { STYLE_SELECTION_COPY } from './selection-copy'
import type { PendingOwnedSelection } from '@/src/app/actions/wardrobe'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}))

// Mock wardrobe actions
vi.mock('@/src/app/actions/wardrobe', () => ({
  getRankedPieces: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  searchPieces: vi.fn().mockResolvedValue([]),
  saveWardrobeSelection: vi.fn().mockResolvedValue({ version: 1 }),
  finalizeOnboardingSelection:vi.fn(),
  addCuratedWardrobePieces:vi.fn(),
}))

// Mock GarmentCard
vi.mock('@/src/components/wardrobe/GarmentCard', () => ({
  default: ({
    name,
    selected,
    selectionIndicator,
  }: {
    name: string
    selected?: boolean
    selectionIndicator?: string
  }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'garment-card',
        'data-selected': selected ? 'true' : 'false',
        'data-indicator': selectionIndicator,
      },
      name,
    ),
}))

const samplePendingWithMultiCategory: PendingOwnedSelection = {
  exists: true,
  itemIds: ['top-1', 'top-2', 'bottom-1', 'footwear-1'],
  items: [
    { id: 'top-1', category: 'top', display_name: 'White Tee', image_url: '/top1.jpg', catalogCollection: 'feminine' },
    { id: 'top-2', category: 'top', display_name: 'Silk Blouse', image_url: '/top2.jpg', catalogCollection: 'feminine' },
    { id: 'bottom-1', category: 'bottom', display_name: 'Denim Jeans', image_url: '/bottom1.jpg', catalogCollection: 'feminine' },
    { id: 'footwear-1', category: 'footwear', display_name: 'Loafers', image_url: '/shoes1.jpg', catalogCollection: 'feminine' },
  ],
  version: 2,
  committed: false,
}

describe('PieceSelectionScreen with Category Tabs', () => {
  it.each([
    ['masculine', false],
    ['feminine', true],
  ] as const)('only renders the one-piece tab when allowed in %s', (collection, expected) => {
    const html = renderToStaticMarkup(React.createElement(PieceSelectionScreen, {
      pending: samplePendingWithMultiCategory, collection,
    }))
    expect(html.includes('id="category-tab-one_piece"')).toBe(expected)
    expect(html).toContain('id="category-tab-footwear"')
  })

  it('renders a semantic, horizontally scrollable category tablist with all 6 categories', () => {
    const html = renderToStaticMarkup(
      React.createElement(PieceSelectionScreen, { pending: samplePendingWithMultiCategory, collection: 'feminine' }),
    )

    // Tablist container
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Clothing categories"')

    // All categories present
    for (const step of SELECTION_STEPS) {
      expect(html).toContain(step.label.replace('&', '&amp;'))
      expect(html).toContain(`id="category-tab-${step.category}"`)
    }

    // First tab (Tops) is selected initially
    expect(html).toContain('role="tab" id="category-tab-top" aria-selected="true"')
    expect(html).toContain('role="tab" id="category-tab-bottom" aria-selected="false"')

    // Tabpanel for active category
    expect(html).toContain('role="tabpanel"')
    expect(html).toContain('id="category-panel-top"')
    expect(html).toContain('aria-labelledby="category-tab-top"')
  })

  it('preserves selections across categories and shows badge counts on tabs', () => {
    const html = renderToStaticMarkup(
      React.createElement(PieceSelectionScreen, { pending: samplePendingWithMultiCategory, collection: 'feminine' }),
    )

    // Tops has 2 selected items
    expect(html).toContain('selected in tops (4 total)')

    // Hand tray displays selected tops in current step
    expect(html).toContain('I own something similar')

    // Bottom navigation accurately sums all categories
    expect(html).toContain('4 total')
  })

  it('renders "None of these" button preserving alternative skip state', () => {
    const html = renderToStaticMarkup(
      React.createElement(PieceSelectionScreen, { pending: samplePendingWithMultiCategory, collection: 'feminine' }),
    )

    expect(html).toContain(STYLE_SELECTION_COPY.emptySelection)
  })

  it('preserves Continue action copy, placement, and calibration disclaimer', () => {
    const html = renderToStaticMarkup(
      React.createElement(PieceSelectionScreen, { pending: samplePendingWithMultiCategory, collection: 'feminine' }),
    )

    // Non-final step shows Next button
    expect(html).toContain('Next')

    // Ownership staging disclaimer
    expect(html).not.toContain('Your selected pieces will be added to your wardrobe after calibration.')
  })

  it('renders Continue with total count when on the final category step', () => {
    // When pending state has items and final step is rendered
    const pendingEmpty: PendingOwnedSelection = {
      exists: true,
      itemIds: ['acc-1'],
      items: [{ id: 'acc-1', category: 'accessory', display_name: 'Belt', image_url: null, catalogCollection: 'feminine' }],
      version: 1,
      committed: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(PieceSelectionScreen, { pending: pendingEmpty, collection: 'feminine' }),
    )

    // 1 total across categories
    expect(html).toContain('1 total')
  })
})

describe('Direct One-Tap Piece Selection Flow', () => {
  it('excludes selected pieces from the browsing rail and shows "All shown pieces are selected or already in your wardrobe."', () => {
    const html = renderToStaticMarkup(
      React.createElement(PieceSelectionScreen, { pending: samplePendingWithMultiCategory, collection: 'feminine' }),
    )

    // Since both loaded tops ('top-1' and 'top-2') are selected, the rail shows the empty-in-hand notice
    expect(html).toContain('All shown pieces are selected or already in your wardrobe.')
    // Hand tray displays the selected pieces
    expect(html).toContain('I own something similar')
    // No preview dialog modal
    expect(html).not.toContain('Have something similar?')
    expect(html).not.toContain('role="dialog"')
  })

  it('renders unselected pieces as direct one-tap accessible native buttons in the rail', () => {
    const pendingWithUnselected: PendingOwnedSelection = {
      exists: true,
      itemIds: ['top-1'],
      items: [
        { id: 'top-1', category: 'top', display_name: 'White Tee', image_url: '/top1.jpg', catalogCollection: 'feminine' },
        { id: 'top-3', category: 'top', display_name: 'Cashmere Knit', image_url: '/top3.jpg', catalogCollection: 'feminine' },
      ],
      version: 1,
      committed: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(PieceSelectionScreen, { pending: pendingWithUnselected, collection: 'feminine' }),
    )

    // Unselected piece 'top-3' appears in the browsing rail with direct select action
    expect(html).toContain('aria-label="Select Cashmere Knit"')
    expect(html).toContain('id="card-piece-top-3"')
    // Selected piece 'top-1' does NOT appear in the rail as a selectable piece
    expect(html).not.toContain('aria-label="Select White Tee"')
    // Selected piece 'top-1' is in the hand tray
    expect(html).toContain('I own something similar')
    expect(html).toContain('White Tee')
  })

  it('renders an accessible aria-live region for screen reader selection feedback without stealing focus', () => {
    const html = renderToStaticMarkup(
      React.createElement(PieceSelectionScreen, { pending: samplePendingWithMultiCategory, collection: 'feminine' }),
    )

    expect(html).toContain('role="status"')
    expect(html).toContain('aria-live="polite"')
  })
})

it('reuses the existing picker and excludes previously owned garments in wardrobe mode',()=>{
 const pending={...samplePendingWithMultiCategory,itemIds:[]}
 const html=renderToStaticMarkup(React.createElement(PieceSelectionScreen,{pending,collection:'feminine',mode:'wardrobe',ownedIds:['top-1']}))
 expect(html).not.toContain('aria-label="Select White Tee"')
 expect(html).toContain('aria-label="Select Silk Blouse"')
 expect(html).toContain('role="tablist"')
})
