import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getProfileSummary: vi.fn(),
  getSavedLooks: vi.fn(),
  getWornLooksHistory: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock('@/src/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
  }),
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/src/app/actions/profile', () => ({
  getProfileSummary: mocks.getProfileSummary,
  getSavedLooks: mocks.getSavedLooks,
  getWornLooksHistory: mocks.getWornLooksHistory,
  saveOutfitLook: vi.fn(),
  unsaveOutfitLook: vi.fn(),
  changeWearDate: vi.fn(),
  undoWear: vi.fn(),
  signOutAction: vi.fn(),
}))

vi.mock('./ProfileStudioClient', () => ({
  default: (props: Record<string, unknown>) =>
    React.createElement('div', {
      'data-testid': 'profile-studio-client',
      'data-display-name': (props.account as { displayName?: string })?.displayName,
      'data-wardrobe-pieces': String((props.counts as { wardrobePieces?: number | null })?.wardrobePieces),
      'data-has-style-data': String((props.passport as { hasStyleData?: boolean })?.hasStyleData),
      'data-saved-failed': String(props.initialSavedFailed),
      'data-worn-failed': String(props.initialWornFailed),
    }),
}))

import ProfilePage from './page'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('ProfilePage server component', () => {
  it('redirects to /login when user is not authenticated', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('No session') })

    await expect(ProfilePage()).rejects.toThrow('REDIRECT:/login')
    expect(mocks.redirect).toHaveBeenCalledWith('/login')
  })

  it('fetches summary, saved looks, and worn looks concurrently and renders ProfileStudioClient', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'auth-user-1', email: 'user@example.com' } },
      error: null,
    })

    mocks.getProfileSummary.mockResolvedValueOnce({
      account: { id: 'auth-user-1', email: 'user@example.com', displayName: 'Alex', initials: 'AL' },
      counts: { wardrobePieces: 15, savedLooks: 3, timesWorn: 8 },
      passport: { topStyles: [], quizSignals: null, hasStyleData: true, caption: 'Based on your style choices.' },
    })

    mocks.getSavedLooks.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })
    mocks.getWornLooksHistory.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })

    const element = await ProfilePage()
    const html = renderToStaticMarkup(element)

    expect(html).toContain('profile-studio-client')
    expect(html).toContain('data-display-name="Alex"')
    expect(html).toContain('data-wardrobe-pieces="15"')
    expect(html).toContain('data-has-style-data="true"')
    expect(html).toContain('data-saved-failed="false"')
    expect(html).toContain('data-worn-failed="false"')
  })

  it('provides safe fallbacks when getProfileSummary fails', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'auth-user-2', email: 'fallback@example.com' } },
      error: null,
    })

    mocks.getProfileSummary.mockRejectedValueOnce(new Error('Profile summary service down'))
    mocks.getSavedLooks.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })
    mocks.getWornLooksHistory.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })

    const element = await ProfilePage()
    const html = renderToStaticMarkup(element)

    expect(html).toContain('profile-studio-client')
    expect(html).toContain('data-display-name="Member"')
    expect(html).toContain('data-wardrobe-pieces="null"')
    expect(html).toContain('data-has-style-data="false"')
  })

  it('flags initialSavedFailed when getSavedLooks rejects while preserving other summary data', async () => {
    mocks.getUser.mockResolvedValueOnce({
      data: { user: { id: 'auth-user-3', email: 'user3@example.com' } },
      error: null,
    })

    mocks.getProfileSummary.mockResolvedValueOnce({
      account: { id: 'auth-user-3', email: 'user3@example.com', displayName: 'Taylor', initials: 'T' },
      counts: { wardrobePieces: 10, savedLooks: 0, timesWorn: 2 },
      passport: { topStyles: [], quizSignals: null, hasStyleData: false, caption: 'Based on your style choices.' },
    })

    mocks.getSavedLooks.mockRejectedValueOnce(new Error('Saved looks database query timeout'))
    mocks.getWornLooksHistory.mockResolvedValueOnce({ items: [], nextCursor: null, hasMore: false })

    const element = await ProfilePage()
    const html = renderToStaticMarkup(element)

    expect(html).toContain('profile-studio-client')
    expect(html).toContain('data-display-name="Taylor"')
    expect(html).toContain('data-saved-failed="true"')
    expect(html).toContain('data-worn-failed="false"')
  })
})
