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
})
