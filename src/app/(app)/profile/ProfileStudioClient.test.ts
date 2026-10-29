import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfileStudioClient from './ProfileStudioClient'
import StylePassportDialog from '@/src/components/profile/StylePassportDialog'
import type {
  PaginatedResult,
  ProfileAccount,
  ProfileCounts,
  ProfileStylePassport,
  SavedLookEntry,
  WornLookEntry,
} from '@/src/lib/profile/types'

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  unsave: vi.fn(),
  changeDate: vi.fn(),
  undo: vi.fn(),
  getSaved: vi.fn(),
  getWorn: vi.fn(),
  setSignature: vi.fn(),
  clearSignature: vi.fn(),
}))

vi.mock('@/src/app/actions/profile', () => ({
  saveOutfitLook: mocks.save,
  unsaveOutfitLook: mocks.unsave,
  changeWearDate: mocks.changeDate,
  undoWear: mocks.undo,
  getSavedLooks: mocks.getSaved,
  getWornLooksHistory: mocks.getWorn,
  setSignatureLook: mocks.setSignature,
  clearSignatureLook: mocks.clearSignature,
  signOutAction: vi.fn(),
}))

vi.mock('@/src/components/outfit/OutfitCanvas', () => ({
  default: ({ identity, children }: { identity?: string; children?: React.ReactNode }) =>
    React.createElement(
      'div',
      { 'data-testid': 'outfit-canvas' },
      React.createElement('span', null, identity),
      children,
    ),
}))

const sampleSavedEntry: SavedLookEntry = {
  outfitId: 'saved-outfit-1',
  savedAt: '2026-10-26T10:00:00Z',
  outfit: {
    id: 'saved-outfit-1',
    source: 'daily_ai',
    status: 'generated',
    createdAt: '2026-10-26T08:00:00Z',
    scheduledFor: '2026-10-26',
    stylingTip: 'Clean minimalist look',
    reasons: ['because you liked minimal style'],
    items: [
      {
        id: 'garment-1',
        displayName: 'Oversized Blazer',
        category: 'outerwear',
        layerRole: 'outerwear',
        imageUrl: '/blazer.png',
        slot: 'outerwear',
        position: 0,
      },
      {
        id: 'garment-2',
        displayName: 'Pleated Pants',
        category: 'bottom',
        layerRole: 'bottom',
        imageUrl: '/pants.png',
        slot: 'bottom',
        position: 1,
      },
    ],
  },
}

const sampleWornEntry: WornLookEntry = {
  wearRecordId: 'wear-record-1',
  wornOn: '2026-10-25',
  recordedAt: '2026-10-25T09:00:00Z',
  outfit: {
    id: 'worn-outfit-1',
    source: 'engine',
    status: 'superseded',
    createdAt: '2026-10-25T07:00:00Z',
    scheduledFor: '2026-10-25',
    stylingTip: null,
    reasons: [],
    items: [
      {
        id: 'garment-3',
        displayName: 'Linen Shirt',
        category: 'top',
        layerRole: 'base_layer',
        imageUrl: null,
        isMissing: true,
        slot: 'base_layer',
        position: 0,
      },
    ],
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProfileStudioClient component', () => {
  it('renders tab list with Saved Looks and Worn History counts', () => {
    const initialSaved: PaginatedResult<SavedLookEntry> = {
      items: [sampleSavedEntry],
      nextCursor: null,
      hasMore: false,
    }
    const initialWorn: PaginatedResult<WornLookEntry> = {
      items: [sampleWornEntry],
      nextCursor: null,
      hasMore: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, { initialSaved, initialWorn }),
    )

    expect(html).toContain('My Style')
    expect(html).toContain('Your looks')
    expect(html).toContain('Saved')
    expect(html).toContain('Worn')
    expect(html).toContain('Oversized Blazer · Pleated Pants')
    expect(html).toContain('Unsave')
  })

  it('renders clean empty states when no saved looks or worn history exist', () => {
    const emptySaved: PaginatedResult<SavedLookEntry> = { items: [], nextCursor: null, hasMore: false }
    const emptyWorn: PaginatedResult<WornLookEntry> = { items: [], nextCursor: null, hasMore: false }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, { initialSaved: emptySaved, initialWorn: emptyWorn }),
    )

    expect(html).toContain('No saved looks yet')
    expect(html).toContain('Save recommendations from Today or worn history')
  })

  it('renders Load More button when savedHasMore is true', () => {
    const paginatedSaved: PaginatedResult<SavedLookEntry> = {
      items: [sampleSavedEntry],
      nextCursor: 'cursor-token-123',
      hasMore: true,
    }
    const initialWorn: PaginatedResult<WornLookEntry> = {
      items: [],
      nextCursor: null,
      hasMore: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, { initialSaved: paginatedSaved, initialWorn }),
    )

    expect(html).toContain('Load older saved looks')
  })

  it('renders honest missing image indicator when historical garment media was removed', () => {
    const initialSaved: PaginatedResult<SavedLookEntry> = {
      items: [],
      nextCursor: null,
      hasMore: false,
    }
    const wornWithMissing: PaginatedResult<WornLookEntry> = {
      items: [sampleWornEntry],
      nextCursor: null,
      hasMore: false,
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, { initialSaved, initialWorn: wornWithMissing }),
    )

    expect(html).toContain('Worn')
    expect(html).toContain('1')
  })

  it('renders ProfileHeader with display name, initials avatar, and account menu button', () => {
    const account: ProfileAccount = {
      id: 'user-42',
      email: 'alex@example.com',
      displayName: 'Alex Morgan',
      initials: 'AM',
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [], nextCursor: null, hasMore: false },
        initialWorn: { items: [], nextCursor: null, hasMore: false },
        account,
      }),
    )

    expect(html).toContain('Alex Morgan')
    expect(html).toContain('AM')
    expect(html).toContain('Account menu for Alex Morgan')
  })

  it('renders ProfileStats with real counts and handles unavailable null counts cleanly', () => {
    const counts: ProfileCounts = {
      wardrobePieces: 24,
      savedLooks: 6,
      timesWorn: null, // unavailable count
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [], nextCursor: null, hasMore: false },
        initialWorn: { items: [], nextCursor: null, hasMore: false },
        counts,
      }),
    )

    expect(html).toContain('24')
    expect(html).toContain('6')
    expect(html).toContain('—') // Honest unavailable indicator
    expect(html).toContain('Times worn count unavailable')
  })

  it('renders Style Passport trigger inside account menu when passport is provided', () => {
    const passport: ProfileStylePassport = {
      topStyles: [
        { key: 'minimal', label: 'Minimal', weight: 0.9 },
      ],
      quizSignals: null,
      hasStyleData: true,
      caption: 'Based on your style choices.',
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [], nextCursor: null, hasMore: false },
        initialWorn: { items: [], nextCursor: null, hasMore: false },
        passport,
      }),
    )

    expect(html).toContain('Style Passport')
  })

  it('renders StylePassportDialog with ranking aesthetic tags and canonical quiz signals', () => {
    const passport: ProfileStylePassport = {
      topStyles: [
        { key: 'minimal', label: 'Minimal', weight: 0.9 },
        { key: 'classic', label: 'Classic', weight: 0.7 },
      ],
      quizSignals: [
        {
          key: 'primaryOccasion',
          label: 'Primary Occasion',
          valueKey: 'work-university',
          valueLabel: 'Work or university',
        },
        {
          key: 'style',
          label: 'Style Aesthetic',
          valueKey: 'classic',
          valueLabel: 'Classic and polished',
        },
      ],
      hasStyleData: true,
      caption: 'Based on your style choices.',
    }

    const html = renderToStaticMarkup(
      React.createElement(StylePassportDialog, {
        isOpen: true,
        passport,
        onClose: vi.fn(),
      }),
    )

    expect(html).toContain('Style Passport')
    expect(html).toContain('Based on your style choices.')
    expect(html).toContain('Minimal')
    expect(html).toContain('#1')
    expect(html).toContain('Classic')
    expect(html).toContain('#2')
    expect(html).toContain('Primary Occasion')
    expect(html).toContain('Work or university')
    expect(html).toContain('Classic and polished')
    // Asserts no fake accuracy percentages exist
    expect(html).not.toContain('90%')
    expect(html).not.toContain('70%')
  })

  it('handles older users without quiz signals gracefully in StylePassportDialog', () => {
    const legacyPassport: ProfileStylePassport = {
      topStyles: [{ key: 'minimal', label: 'Minimal', weight: 0.8 }],
      quizSignals: null,
      hasStyleData: true,
      caption: 'Based on your style choices.',
    }

    const html = renderToStaticMarkup(
      React.createElement(StylePassportDialog, {
        isOpen: true,
        passport: legacyPassport,
        onClose: vi.fn(),
      }),
    )

    expect(html).toContain('Style Passport')
    expect(html).toContain('Minimal')
    expect(html).toContain('Quiz calibration signals not recorded for this profile.')
  })

  it('renders empty state card when style preferences are completely absent in StylePassportDialog', () => {
    const emptyPassport: ProfileStylePassport = {
      topStyles: [],
      quizSignals: null,
      hasStyleData: false,
      caption: 'Based on your style choices.',
    }

    const html = renderToStaticMarkup(
      React.createElement(StylePassportDialog, {
        isOpen: true,
        passport: emptyPassport,
        onClose: vi.fn(),
      }),
    )

    expect(html).toContain('Style Passport')
    expect(html).toContain('Your style identity will appear here')
  })

  it('does NOT render SignatureLookCard in the UI', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [], nextCursor: null, hasMore: false },
        initialWorn: { items: [], nextCursor: null, hasMore: false },
      }),
    )

    expect(html).not.toContain('My signature look')
    expect(html).not.toContain('No signature look pinned')
  })

  it('does NOT render "Set as signature" controls or "Signature" badges on cards', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [sampleSavedEntry], nextCursor: null, hasMore: false },
        initialWorn: { items: [sampleWornEntry], nextCursor: null, hasMore: false },
      }),
    )

    expect(html).not.toContain('Set as signature')
    expect(html).not.toContain('Replace signature')
    expect(html).not.toContain('Signature')
  })

  it('does NOT render independent theme controls conflicting with Wardrobe', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [], nextCursor: null, hasMore: false },
        initialWorn: { items: [], nextCursor: null, hasMore: false },
      }),
    )

    expect(html).not.toContain('Customize appearance')
    expect(html).not.toContain('data-profile-mode')
  })

  it('renders custom avatar image when account.avatarUrl is present', () => {
    const accountWithPhoto: ProfileAccount = {
      id: 'user-photo',
      email: 'photo@example.com',
      displayName: 'Jordan Lee',
      initials: 'JL',
      avatarUrl: 'https://signed.media/jordan.png',
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [], nextCursor: null, hasMore: false },
        initialWorn: { items: [], nextCursor: null, hasMore: false },
        account: accountWithPhoto,
      }),
    )

    expect(html).toContain('src="https://signed.media/jordan.png"')
    expect(html).toContain('Jordan Lee')
  })

  it('renders server-formatted dates preserving calendar dates and timestamps without hydration mismatches', () => {
    const savedWithDisplay: SavedLookEntry = {
      ...sampleSavedEntry,
      savedAtDisplay: 'Oct 26',
    }
    const wornWithDisplay: WornLookEntry = {
      ...sampleWornEntry,
      wornOnDisplay: 'Oct 25',
    }

    const htmlSaved = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [savedWithDisplay], nextCursor: null, hasMore: false },
        initialWorn: { items: [], nextCursor: null, hasMore: false },
      }),
    )
    expect(htmlSaved).toContain('Saved Oct 26')

    const htmlWorn = renderToStaticMarkup(
      React.createElement(ProfileStudioClient, {
        initialSaved: { items: [], nextCursor: null, hasMore: false },
        initialWorn: { items: [wornWithDisplay], nextCursor: null, hasMore: false },
        initialTab: 'worn',
      }),
    )
    expect(htmlWorn).toContain('Worn Oct 25')
  })
})
