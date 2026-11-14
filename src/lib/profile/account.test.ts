import { describe, expect, it } from 'vitest'
import { deriveDisplayNameAndInitials } from './account'

describe('deriveDisplayNameAndInitials', () => {
  it('derives initials from multi-word full_name', () => {
    const res = deriveDisplayNameAndInitials({
      id: 'u-1',
      user_metadata: { full_name: 'Alex Rivera' },
    })
    expect(res).toEqual({
      displayName: 'Alex Rivera',
      initials: 'AR',
    })
  })

  it('derives initials from single-word name', () => {
    const res = deriveDisplayNameAndInitials({
      id: 'u-2',
      user_metadata: { name: 'Taylor' },
    })
    expect(res).toEqual({
      displayName: 'Taylor',
      initials: 'TA',
    })
  })

  it('derives initials from display_name', () => {
    const res = deriveDisplayNameAndInitials({
      id: 'u-3',
      user_metadata: { display_name: 'Jordan Lee Smith' },
    })
    expect(res).toEqual({
      displayName: 'Jordan Lee Smith',
      initials: 'JS',
    })
  })

  it('uses neutral fallback Member / M when user_metadata is null or empty', () => {
    expect(
      deriveDisplayNameAndInitials({
        id: 'u-4',
        email: 'test@example.com',
        user_metadata: null,
      }),
    ).toEqual({
      displayName: 'Member',
      initials: 'M',
    })

    expect(
      deriveDisplayNameAndInitials({
        id: 'u-5',
        email: 'test2@example.com',
        user_metadata: {},
      }),
    ).toEqual({
      displayName: 'Member',
      initials: 'M',
    })
  })

  it('handles whitespace-only name strings cleanly', () => {
    expect(
      deriveDisplayNameAndInitials({
        id: 'u-6',
        user_metadata: { full_name: '   ' },
      }),
    ).toEqual({
      displayName: 'Member',
      initials: 'M',
    })
  })
})
