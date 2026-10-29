import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import SignatureLookCard from './SignatureLookCard'
import OutfitDetailsDialog from './OutfitDetailsDialog'
import type { ProfileOutfitLook, SignatureLookData } from '@/src/lib/profile/types'

vi.mock('@/src/components/outfit/OutfitCanvas', () => ({
  default: ({ identity, variant }: { identity?: string; variant?: string }) =>
    React.createElement('div', { 'data-testid': 'outfit-canvas', 'data-variant': variant }, identity),
}))

const sampleOutfit: ProfileOutfitLook = {
  id: 'outfit-test-1',
  source: 'daily_ai',
  status: 'generated',
  createdAt: '2026-10-27T10:00:00Z',
  scheduledFor: '2026-10-27',
  stylingTip: 'Refined tonal textures.',
  reasons: ['Cohesive palette', 'Balanced proportions'],
  items: [
    {
      id: 'g-1',
      displayName: 'Merino Wool Turtleneck',
      category: 'top',
      layerRole: 'base_layer',
      imageUrl: '/merino.png',
      slot: 'base_layer',
      position: 0,
      isMissing: false,
    },
    {
      id: 'g-2',
      displayName: 'Tailored Wide-Leg Trousers',
      category: 'bottom',
      layerRole: 'bottom',
      imageUrl: null,
      slot: 'bottom',
      position: 1,
      isMissing: true,
    },
  ],
}

describe('SignatureLookCard component', () => {
  it('renders section title and brief explanation according to product spec', () => {
    const html = renderToStaticMarkup(
      React.createElement(SignatureLookCard, {
        signatureLook: null,
        onUnpin: vi.fn(),
      }),
    )

    expect(html).toContain('My signature look')
    expect(html).toContain('A look that feels like you.')
    expect(html).toContain('No signature look pinned')
  })

  it('renders pinned outfit with prominent composition and actions', () => {
    const signatureLook: SignatureLookData = {
      outfitId: sampleOutfit.id,
      version: 1,
      pinnedAt: '2026-10-27T10:00:00Z',
      outfit: sampleOutfit,
    }

    const html = renderToStaticMarkup(
      React.createElement(SignatureLookCard, {
        signatureLook,
        onUnpin: vi.fn(),
      }),
    )

    expect(html).toContain('Pinned')
    expect(html).toContain('View details')
    expect(html).toContain('Unpin')
    expect(html).toContain('Merino Wool Turtleneck · Tailored Wide-Leg Trousers')
    expect(html).toContain('data-variant="thumbnail"')
    expect(html).toContain('Styling tip: “Refined tonal textures.”')
  })
})

describe('OutfitDetailsDialog component', () => {
  it('returns null when isOpen is false', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitDetailsDialog, {
        isOpen: false,
        outfit: sampleOutfit,
        onClose: vi.fn(),
      }),
    )

    expect(html).toBe('')
  })

  it('renders accessible dialog with aria attributes, garment breakdown, and honest image placeholders', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitDetailsDialog, {
        isOpen: true,
        outfit: sampleOutfit,
        onClose: vi.fn(),
      }),
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby="outfit-details-title"')
    expect(html).toContain('Look Details')
    expect(html).toContain('Outfit Composition')
    expect(html).toContain('Garments in this combination (2)')
    expect(html).toContain('Merino Wool Turtleneck')
    expect(html).toContain('Tailored Wide-Leg Trousers')
    expect(html).toContain('Cohesive palette')
    expect(html).toContain('Balanced proportions')
    expect(html).toContain('Close details dialog')
  })
})
