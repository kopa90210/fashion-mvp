import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ProfileStudioClient from './ProfileStudioClient'
import type {
  PaginatedResult,
  SavedLookEntry,
  WornLookEntry,
} from '@/src/lib/profile/types'

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    className,
    unoptimized,
  }: React.ComponentProps<'img'> & { unoptimized?: boolean }) =>
    React.createElement('img', {
      src,
      alt,
      className,
      'data-unoptimized': unoptimized ? 'true' : 'false',
    }),
}))

vi.mock('@/src/app/actions/profile', () => ({
  saveOutfitLook: vi.fn(),
  unsaveOutfitLook: vi.fn(),
  changeWearDate: vi.fn(),
  undoWear: vi.fn(),
  getSavedLooks: vi.fn(),
  getWornLooksHistory: vi.fn(),
  setSignatureLook: vi.fn(),
  clearSignatureLook: vi.fn(),
  signOutAction: vi.fn(),
}))

describe('Profile Saved/Worn Outfit Thumbnails (Real Canvas Regression)', () => {
  const jumpsuitSavedEntry: SavedLookEntry = {
    outfitId: 'saved-jumpsuit-1',
    savedAt: '2026-10-29T10:00:00Z',
    outfit: {
      id: 'saved-jumpsuit-1',
      source: 'daily_ai',
      status: 'generated',
      createdAt: '2026-10-29T08:00:00Z',
      scheduledFor: '2026-10-29',
      stylingTip: 'Statement black silhouette.',
      reasons: ['Monochrome palette', 'Versatile tailored drape'],
      items: [
        {
          id: 'garment-jumpsuit',
          displayName: 'Black Jumpsuit',
          category: 'one_piece',
          layerRole: 'one_piece',
          imageUrl: 'https://images.test/black-jumpsuit.png',
          slot: 'one_piece',
          position: 0,
        },
        {
          id: 'garment-pumps',
          displayName: 'Black Pumps',
          category: 'footwear',
          layerRole: 'footwear',
          imageUrl: 'https://images.test/black-pumps.png',
          slot: 'footwear',
          position: 1,
        },
      ],
    },
  }

  const separatesWornEntry: WornLookEntry = {
    wearRecordId: 'wear-record-separates',
    wornOn: '2026-10-28',
    recordedAt: '2026-10-28T09:00:00Z',
    outfit: {
      id: 'worn-separates-1',
      source: 'engine',
      status: 'generated',
      createdAt: '2026-10-28T07:00:00Z',
      scheduledFor: '2026-10-28',
      stylingTip: null,
      reasons: ['Classic separates'],
      items: [
        {
          id: 'garment-top',
          displayName: 'Cream Silk Blouse',
          category: 'top',
          layerRole: 'base_layer',
          imageUrl: 'https://images.test/cream-blouse.png',
          slot: 'base_layer',
          position: 0,
        },
        {
          id: 'garment-bottom',
          displayName: 'Wide Leg Trousers',
          category: 'bottom',
          layerRole: 'bottom',
          imageUrl: 'https://images.test/trousers.png',
          slot: 'bottom',
          position: 1,
        },
        {
          id: 'garment-shoes',
          displayName: 'Leather Loafers',
          category: 'footwear',
          layerRole: 'footwear',
          imageUrl: 'https://images.test/loafers.png',
          slot: 'footwear',
          position: 2,
        },
      ],
    },
  }

  const outerwearWithMissingMediaEntry: SavedLookEntry = {
    outfitId: 'saved-outerwear-missing',
    savedAt: '2026-10-27T10:00:00Z',
    outfit: {
      id: 'saved-outerwear-missing',
      source: 'daily_ai',
      status: 'generated',
      createdAt: '2026-10-27T08:00:00Z',
      scheduledFor: '2026-10-27',
      stylingTip: 'Layered textures.',
      reasons: ['Warm layer'],
      items: [
        {
          id: 'garment-blazer',
          displayName: 'Oversized Blazer',
          category: 'outerwear',
          layerRole: 'outerwear',
          imageUrl: 'https://images.test/blazer.png',
          slot: 'outerwear',
          position: 0,
        },
        {
          id: 'garment-deleted-tee',
          displayName: 'Basic Tee',
          category: 'top',
          layerRole: 'base_layer',
          imageUrl: null, // Media missing or unavailable
          slot: 'base_layer',
          position: 1,
          isMissing: true,
        },
        {
          id: 'garment-jeans',
          displayName: 'Blue Denim',
          category: 'bottom',
          layerRole: 'bottom',
          imageUrl: 'https://images.test/jeans.png',
          slot: 'bottom',
          position: 2,
        },
      ],
    },
  }

  it('renders jumpsuit + pumps thumbnail with valid garment nodes and nonzero dimensions', () => {
    const initialSaved: PaginatedResult<SavedLookEntry> = {
      items: [jumpsuitSavedEntry],
      nextCursor: null,
      hasMore: false,
    }
    const initialWorn: PaginatedResult<WornLookEntry> = {
      items: [],
      nextCursor: null,
      hasMore: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved,
        initialWorn,
        initialTab: 'saved',
      }),
    )

    // 1. Verify canvas container has size-full and 4/5 aspect ratio
    expect(html).toContain('data-variant="thumbnail"')
    expect(html).toContain('size-full rounded-2xl')
    expect(html).toContain('aspect-4/5')

    // 2. Verify jumpsuit item is placed with nonzero coordinates
    expect(html).toContain('data-slot="one_piece"')
    expect(html).toContain('alt="Black Jumpsuit"')
    expect(html).toContain('src="https://images.test/black-jumpsuit.png"')

    // 3. Verify footwear item is placed with nonzero coordinates
    expect(html).toContain('data-slot="footwear"')
    expect(html).toContain('alt="Black Pumps"')
    expect(html).toContain('src="https://images.test/black-pumps.png"')

    // 4. Verify coordinates and widths are NOT NaN or 0
    expect(html).not.toContain('NaN')
    expect(html).toContain('--flatlay-width:')
    expect(html).not.toContain('--flatlay-width:0%')
    expect(html).toContain('--flatlay-height:')
    expect(html).not.toContain('--flatlay-height:0%')
  })

  it('renders 3-piece separates in Worn history tab with all garment nodes', () => {
    const initialSaved: PaginatedResult<SavedLookEntry> = {
      items: [],
      nextCursor: null,
      hasMore: false,
    }
    const initialWorn: PaginatedResult<WornLookEntry> = {
      items: [separatesWornEntry],
      nextCursor: null,
      hasMore: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved,
        initialWorn,
        initialTab: 'worn',
      }),
    )

    expect(html).toContain('Cream Silk Blouse · Wide Leg Trousers · Leather Loafers')
    expect(html).toContain('alt="Cream Silk Blouse"')
    expect(html).toContain('alt="Wide Leg Trousers"')
    expect(html).toContain('alt="Leather Loafers"')
    expect(html).toContain('data-slot="top"')
    expect(html).toContain('data-slot="bottom"')
    expect(html).toContain('data-slot="footwear"')
    expect(html).not.toContain('NaN')
  })

  it('renders honest placeholder when a garment image is missing in an outerwear look', () => {
    const initialSaved: PaginatedResult<SavedLookEntry> = {
      items: [outerwearWithMissingMediaEntry],
      nextCursor: null,
      hasMore: false,
    }
    const initialWorn: PaginatedResult<WornLookEntry> = {
      items: [],
      nextCursor: null,
      hasMore: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved,
        initialWorn,
        initialTab: 'saved',
      }),
    )

    // The available items render their images
    expect(html).toContain('alt="Oversized Blazer"')
    expect(html).toContain('alt="Blue Denim"')

    // The missing item renders honest placeholder
    expect(html).toContain('data-image-state="error"')
    expect(html).toContain('aria-label="Basic Tee image unavailable"')
    expect(html).not.toContain('NaN')
  })

  it('renders honest empty stage placeholder when outfit has no items', () => {
    const emptyOutfitEntry: SavedLookEntry = {
      outfitId: 'saved-empty',
      savedAt: '2026-10-27T10:00:00Z',
      outfit: {
        id: 'saved-empty',
        source: 'daily_ai',
        status: 'generated',
        createdAt: '2026-10-27T08:00:00Z',
        scheduledFor: null,
        stylingTip: null,
        reasons: [],
        items: [],
      },
    }

    const initialSaved: PaginatedResult<SavedLookEntry> = {
      items: [emptyOutfitEntry],
      nextCursor: null,
      hasMore: false,
    }
    const initialWorn: PaginatedResult<WornLookEntry> = {
      items: [],
      nextCursor: null,
      hasMore: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved,
        initialWorn,
        initialTab: 'saved',
      }),
    )

    expect(html).toContain('data-image-state="empty"')
    expect(html).toContain('aria-label="No garments in outfit"')
  })
})
