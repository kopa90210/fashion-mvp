import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  updateUser: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  signedUrl: vi.fn(),
  uploadPrivate: vi.fn(),
  deletePrivate: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}))

vi.mock('@/src/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getUser: mocks.auth,
      updateUser: mocks.updateUser,
      signOut: mocks.signOut,
    },
    rpc: mocks.rpc,
    from: mocks.from,
  }),
}))

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}))

vi.mock('next/navigation', () => ({
  redirect: mocks.redirect,
}))

vi.mock('@/src/lib/media/private-media', () => ({
  signedOwnedPrivatePreviewUrl: mocks.signedUrl,
  uploadValidatedPrivateImage: mocks.uploadPrivate,
  deletePrivateObject: mocks.deletePrivate,
}))

import {
  saveOutfitLook,
  unsaveOutfitLook,
  isOutfitSaved,
  recordWear,
  changeWearDate,
  undoWear,
  getSavedLooks,
  getWornLooksHistory,
  getProfileSummary,
  getSignatureLook,
  setSignatureLook,
  clearSignatureLook,
  signOutAction,
  uploadAvatarAction,
  removeAvatarAction,
} from './profile'

const validOutfitId = '11111111-1111-1111-1111-111111111111'
const validWearRecordId = '22222222-2222-2222-2222-222222222222'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({
    data: { user: { id: 'test-user-id' } },
    error: null,
  })
  mocks.signedUrl.mockResolvedValue('https://signed.media/preview.png')
  mocks.updateUser.mockResolvedValue({ data: {}, error: null })
  mocks.uploadPrivate.mockResolvedValue({
    bucket: 'private-wardrobe-media',
    path: 'test-user-id/avatar-new.jpg',
    mimeType: 'image/jpeg',
    byteSize: 1024,
    sha256: 'sha256hash',
    width: 400,
    height: 400,
  })
})

describe('Gate 1 Profile Style Studio — Saved Looks Actions', () => {
  it('saves an eligible outfit via save_outfit_look RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: '2026-10-26T12:00:00Z',
      error: null,
    })

    const res = await saveOutfitLook(validOutfitId)
    expect(res).toEqual({ success: true, savedAt: '2026-10-26T12:00:00Z' })
    expect(mocks.rpc).toHaveBeenCalledWith('save_outfit_look', { p_outfit_id: validOutfitId })
  })

  it('rejects invalid outfit ID format on save', async () => {
    await expect(saveOutfitLook('not-a-uuid')).rejects.toThrow('Invalid outfit ID')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('unsaves an outfit via unsave_outfit_look RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null })
    const res = await unsaveOutfitLook(validOutfitId)
    expect(res).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith('unsave_outfit_look', { p_outfit_id: validOutfitId })
  })

  it('checks if outfit is saved', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { outfit_id: validOutfitId }, error: null }),
    }
    mocks.from.mockReturnValue(chain)

    const saved = await isOutfitSaved(validOutfitId)
    expect(saved).toBe(true)
    expect(mocks.from).toHaveBeenCalledWith('saved_outfits')
  })
})

describe('Gate 1 Profile Style Studio — Canonical Worn History Actions', () => {
  it('records an outfit as worn using single transactional RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: validWearRecordId,
        worn_on: '2026-10-26',
        interaction_id: 'interaction-id',
        replayed: false,
        undone: false,
      },
      error: null,
    })

    const res = await recordWear(validOutfitId)
    expect(res).toEqual({
      success: true,
      wearRecordId: validWearRecordId,
      wornOn: '2026-10-26',
      replayed: false,
      undone: false,
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_canonical_outfit_worn', {
      p_outfit_id: validOutfitId,
      p_worn_on: null,
      p_idempotency_key: `profile:worn:${validOutfitId}:today`,
    })
  })

  it('allows explicit wornOn date and custom idempotency key', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: validWearRecordId,
        worn_on: '2026-10-20',
        interaction_id: 'interaction-id',
        replayed: false,
        undone: false,
      },
      error: null,
    })

    const res = await recordWear(validOutfitId, '2026-10-20', 'custom-key')
    expect(res.wornOn).toBe('2026-10-20')
    expect(mocks.rpc).toHaveBeenCalledWith('record_canonical_outfit_worn', {
      p_outfit_id: validOutfitId,
      p_worn_on: '2026-10-20',
      p_idempotency_key: 'custom-key',
    })
  })

  it('handles replayed wear request returning existing record state', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: validWearRecordId,
        worn_on: '2026-10-20',
        interaction_id: 'interaction-id',
        replayed: true,
        undone: false,
      },
      error: null,
    })

    const res = await recordWear(validOutfitId, '2026-10-20', 'replayed-key')
    expect(res.replayed).toBe(true)
    expect(res.undone).toBe(false)
    expect(res.wearRecordId).toBe(validWearRecordId)
  })

  it('handles retry of previously undone wear without recreating record', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: null,
        worn_on: null,
        interaction_id: 'interaction-id',
        replayed: true,
        undone: true,
      },
      error: null,
    })

    const res = await recordWear(validOutfitId, '2026-10-20', 'undone-key')
    expect(res.replayed).toBe(true)
    expect(res.undone).toBe(true)
    expect(res.wearRecordId).toBe('')
    expect(res.success).toBe(false)
  })

  it('corrects wear date successfully', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { id: validWearRecordId, worn_on: '2026-10-21' },
      error: null,
    })

    const res = await changeWearDate(validWearRecordId, '2026-10-21')
    expect(res).toEqual({
      success: true,
      wearRecordId: validWearRecordId,
      wornOn: '2026-10-21',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('update_outfit_wear_date', {
      p_wear_record_id: validWearRecordId,
      p_new_worn_on: '2026-10-21',
    })
  })

  it('rejects date correction on conflict code 23505', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'Outfit already marked as worn on this date' },
    })

    await expect(changeWearDate(validWearRecordId, '2026-10-22')).rejects.toThrow(
      'This outfit was already marked as worn on this date',
    )
  })

  it('undos accidental wear recording', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null })
    const res = await undoWear(validWearRecordId)
    expect(res).toEqual({ success: true })
    expect(mocks.rpc).toHaveBeenCalledWith('undo_outfit_worn', {
      p_wear_record_id: validWearRecordId,
    })
  })
})

describe('Gate 1 Profile Style Studio — Paginated Reads, Snapshot Preservation & Media Resolution', () => {
  it('preserves historical composition from garment_snapshot even when live outfit_items cascaded', async () => {
    const mockRows = [
      {
        outfit_id: validOutfitId,
        created_at: '2026-10-26T10:00:00Z',
        // Server-captured snapshot has 2 garments
        garment_snapshot: [
          {
            wardrobe_item_id: 'garment-1',
            slot: 'base_layer',
            position: 0,
            display_name: 'White Oxford Shirt',
            category: 'top',
            media_asset_id: 'media-1',
            image_url: null,
          },
          {
            wardrobe_item_id: 'garment-2',
            slot: 'bottom',
            position: 1,
            display_name: 'Navy Chinos',
            category: 'bottom',
            media_asset_id: 'media-deleted-asset', // asset deleted
            image_url: null,
          },
        ],
        outfits: {
          id: validOutfitId,
          source: 'daily_ai',
          status: 'generated',
          created_at: '2026-10-26T08:00:00Z',
          // Live outfit_items cascaded and is completely empty!
          outfit_items: [],
        },
      },
    ]

    const queryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    }
    const ownershipChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [{ item_id: 'garment-1', retired_at: null }], error: null }),
    }

    mocks.from.mockImplementation((table: string) => {
      if (table === 'saved_outfits') return queryChain
      if (table === 'user_wardrobe_items') return ownershipChain
      return {}
    })

    // Garment 1 media resolves, garment 2 media fails (asset deleted)
    mocks.signedUrl.mockImplementation(async (_client: unknown, assetId: string) => {
      if (assetId === 'media-1') return 'https://signed.media/shirt.png'
      return null
    })

    const res = await getSavedLooks(undefined, 8)
    expect(res.items).toHaveLength(1)
    const items = res.items[0].outfit.items
    // Historical 2-piece combination is preserved despite outfit_items cascade!
    expect(items).toHaveLength(2)

    expect(items[0].displayName).toBe('White Oxford Shirt')
    expect(items[0].slot).toBe('base_layer')
    expect(items[0].imageUrl).toBe('https://signed.media/shirt.png')
    expect(items[0].isMissing).toBe(false)

    expect(items[1].displayName).toBe('Navy Chinos')
    expect(items[1].slot).toBe('bottom')
    expect(items[1].imageUrl).toBeNull()
    expect(items[1].isMissing).toBe(true) // Honest placeholder
  })

  it('fetches worn looks history with keyset cursor pagination and superseded outfit support', async () => {
    const mockRows = [
      {
        id: validWearRecordId,
        worn_on: '2026-10-26',
        created_at: '2026-10-26T09:00:00Z',
        outfit_id: validOutfitId,
        garment_snapshot: [],
        outfits: {
          id: validOutfitId,
          source: 'engine',
          status: 'superseded', // Historical superseded outfit
          created_at: '2026-10-26T08:00:00Z',
          outfit_items: [],
        },
      },
    ]

    const queryChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: mockRows, error: null }),
    }
    const ownershipChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
    }

    mocks.from.mockImplementation((table: string) => {
      if (table === 'outfit_wear_records') return queryChain
      if (table === 'user_wardrobe_items') return ownershipChain
      return {}
    })

    const res = await getWornLooksHistory(undefined, 1)
    expect(res.items).toHaveLength(1)
    expect(res.items[0].wornOn).toBe('2026-10-26')
    expect(res.items[0].outfit.status).toBe('superseded')
  })
})

describe('Gate 2 Profile Style Studio — Profile Summary and Style Passport', () => {
  it('rejects unauthenticated requests to getProfileSummary', async () => {
    mocks.auth.mockResolvedValueOnce({ data: { user: null }, error: new Error('Session expired') })
    await expect(getProfileSummary()).rejects.toThrow('Not authenticated')
  })

  it('fetches full summary with account, full-dataset counts, and 5 quiz signals', async () => {
    mocks.auth.mockResolvedValueOnce({
      data: {
        user: {
          id: 'test-user-id',
          email: 'alex@example.com',
          user_metadata: { full_name: 'Alex Rivera' },
        },
      },
      error: null,
    })

    const wardrobeChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 18, error: null }),
    }
    const savedChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 5, error: null }),
    }
    const wearChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 12, error: null }),
    }
    const dnaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          vector: { minimal: 0.9, classic: 0.7, streetwear: 0.4 },
          quiz_signals: {
            primaryOccasion: 'work-university',
            style: 'minimal',
            fit: 'regular',
            formality: 'put-together',
            exploration: 'small-twist',
          },
        },
        error: null,
      }),
    }

    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_wardrobe_items') return wardrobeChain
      if (table === 'saved_outfits') return savedChain
      if (table === 'outfit_wear_records') return wearChain
      if (table === 'fashion_dna') return dnaChain
      return {}
    })

    const summary = await getProfileSummary()

    // Account
    expect(summary.account).toEqual({
      id: 'test-user-id',
      email: 'alex@example.com',
      displayName: 'Alex Rivera',
      initials: 'AR',
      avatarUrl: null,
    })

    // Counts
    expect(summary.counts).toEqual({
      wardrobePieces: 18,
      savedLooks: 5,
      timesWorn: 12,
    })

    // Passport
    expect(summary.passport.hasStyleData).toBe(true)
    expect(summary.passport.topStyles).toHaveLength(3)
    expect(summary.passport.topStyles[0].label).toBe('Minimal')
    expect(summary.passport.topStyles[1].label).toBe('Classic')
    expect(summary.passport.topStyles[2].label).toBe('Streetwear')
    expect(summary.passport.quizSignals).toHaveLength(5)
    expect(summary.passport.quizSignals?.[0]).toEqual({
      key: 'primaryOccasion',
      label: 'Primary Occasion',
      valueKey: 'work-university',
      valueLabel: 'Work or university',
    })
  })

  it('uses neutral fallback when user has no name metadata', async () => {
    mocks.auth.mockResolvedValueOnce({
      data: {
        user: {
          id: 'test-user-id',
          email: 'anon@example.com',
          user_metadata: {},
        },
      },
      error: null,
    })

    const emptyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 0, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    emptyChain.eq.mockReturnValue(emptyChain)

    mocks.from.mockReturnValue(emptyChain)

    const summary = await getProfileSummary()
    expect(summary.account.displayName).toBe('Member')
    expect(summary.account.initials).toBe('M')
    expect(summary.passport.hasStyleData).toBe(false)
  })

  it('handles legacy users without quiz signals gracefully', async () => {
    mocks.auth.mockResolvedValueOnce({
      data: {
        user: {
          id: 'legacy-user-id',
          email: 'legacy@example.com',
          user_metadata: { name: 'Legacy' },
        },
      },
      error: null,
    })

    const dnaChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          vector: { minimal: 0.8 },
          quiz_signals: null, // Legacy user predating five-signal quiz
        },
        error: null,
      }),
    }

    const countChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: 3, error: null }),
    }
    countChain.eq.mockReturnValue(countChain)

    mocks.from.mockImplementation((table: string) => {
      if (table === 'fashion_dna') return dnaChain
      return countChain
    })

    const summary = await getProfileSummary()
    expect(summary.passport.hasStyleData).toBe(true)
    expect(summary.passport.topStyles).toHaveLength(1)
    expect(summary.passport.topStyles[0].label).toBe('Minimal')
    expect(summary.passport.quizSignals).toBeNull() // Gracefully null
  })

  it('returns unavailable null count when a query fails instead of fabricated zero', async () => {
    mocks.auth.mockResolvedValueOnce({
      data: {
        user: {
          id: 'user-id',
          email: 'err@example.com',
          user_metadata: null,
        },
      },
      error: null,
    })

    const failingWardrobe = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockResolvedValue({ count: null, error: new Error('DB connection error') }),
    }
    const okSaved = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 3, error: null }),
    }
    const okWear = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ count: 7, error: null }),
    }
    const okDna = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }

    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_wardrobe_items') return failingWardrobe
      if (table === 'saved_outfits') return okSaved
      if (table === 'outfit_wear_records') return okWear
      if (table === 'fashion_dna') return okDna
      return {}
    })

    const summary = await getProfileSummary()
    expect(summary.counts.wardrobePieces).toBeNull() // Honest unavailable state
    expect(summary.counts.savedLooks).toBe(3)
    expect(summary.counts.timesWorn).toBe(7)
  })

  it('signs out user, revalidates layout, and redirects to /login', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: null })
    await signOutAction()
    expect(mocks.signOut).toHaveBeenCalled()
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/', 'layout')
    expect(mocks.redirect).toHaveBeenCalledWith('/login')
  })
})

describe('Gate 3 Profile Style Studio — Signature Look Actions', () => {
  it('returns null when getSignatureLook finds no pinned outfit or on query error', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    mocks.from.mockReturnValue(chain)

    const res = await getSignatureLook()
    expect(res).toBeNull()
    expect(mocks.from).toHaveBeenCalledWith('user_signature_looks')
  })

  it('returns null when pinned outfit has invalid status', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          outfit_id: validOutfitId,
          version: 1,
          pinned_at: '2026-10-27T12:00:00Z',
          garment_snapshot: [],
          outfits: { id: validOutfitId, status: 'invalid' },
        },
        error: null,
      }),
    }
    mocks.from.mockReturnValue(chain)

    const res = await getSignatureLook()
    expect(res).toBeNull()
  })

  it('reads pinned signature look, preserving historical snapshot and resolving private media', async () => {
    const mockRow = {
      outfit_id: validOutfitId,
      version: 2,
      pinned_at: '2026-10-27T14:00:00Z',
      garment_snapshot: [
        {
          wardrobe_item_id: 'garment-1',
          slot: 'base_layer',
          position: 0,
          display_name: 'Charcoal Knit',
          category: 'top',
          media_asset_id: 'media-1',
          image_url: null,
        },
        {
          wardrobe_item_id: 'garment-2',
          slot: 'bottom',
          position: 1,
          display_name: 'Ecru Trousers',
          category: 'bottom',
          media_asset_id: 'media-deleted',
          image_url: null,
        },
      ],
      outfit_snapshot: { styling_tip: 'Pair with minimal silver jewelry.' },
      outfits: {
        id: validOutfitId,
        source: 'daily_ai',
        status: 'generated',
        outfit_items: [],
      },
    }

    const sigChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: mockRow, error: null }),
    }
    const ownershipChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ item_id: 'garment-1', retired_at: null }],
        error: null,
      }),
    }

    mocks.from.mockImplementation((table: string) => {
      if (table === 'user_signature_looks') return sigChain
      if (table === 'user_wardrobe_items') return ownershipChain
      return {}
    })

    mocks.signedUrl.mockImplementation(async (_client: unknown, assetId: string) => {
      if (assetId === 'media-1') return 'https://signed.media/charcoal-knit.png'
      return null
    })

    const res = await getSignatureLook()
    expect(res).not.toBeNull()
    expect(res?.outfitId).toBe(validOutfitId)
    expect(res?.version).toBe(2)
    expect(res?.pinnedAt).toBe('2026-10-27T14:00:00Z')
    expect(res?.outfit.stylingTip).toBe('Pair with minimal silver jewelry.')
    expect(res?.outfit.items).toHaveLength(2)

    expect(res?.outfit.items[0].displayName).toBe('Charcoal Knit')
    expect(res?.outfit.items[0].imageUrl).toBe('https://signed.media/charcoal-knit.png')
    expect(res?.outfit.items[0].isMissing).toBe(false)

    expect(res?.outfit.items[1].displayName).toBe('Ecru Trousers')
    expect(res?.outfit.items[1].imageUrl).toBeNull()
    expect(res?.outfit.items[1].isMissing).toBe(true)
  })

  it('rejects invalid outfit ID format on setSignatureLook', async () => {
    await expect(setSignatureLook('not-a-valid-uuid')).rejects.toThrow('Invalid outfit ID')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('calls set_signature_look RPC and revalidates /profile', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        outfit_id: validOutfitId,
        version: 3,
        pinned_at: '2026-10-27T15:00:00Z',
      },
      error: null,
    })

    const res = await setSignatureLook(validOutfitId, 2)
    expect(res).toEqual({
      success: true,
      outfitId: validOutfitId,
      version: 3,
      pinnedAt: '2026-10-27T15:00:00Z',
    })
    expect(mocks.rpc).toHaveBeenCalledWith('set_signature_look', {
      p_outfit_id: validOutfitId,
      p_expected_version: 2,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/profile')
  })

  it('handles concurrency conflict 40900 on setSignatureLook', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '40900', message: 'Signature look modified by concurrent session' },
    })

    await expect(setSignatureLook(validOutfitId, 1)).rejects.toThrow(
      'Signature look was modified in another session. Please refresh and try again.',
    )
  })

  it('returns null when user_signature_looks has outfit_id as null (unpinned state)', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          outfit_id: null,
          version: 2,
          pinned_at: '2026-10-27T12:00:00Z',
          garment_snapshot: [],
          outfits: null,
        },
        error: null,
      }),
    }
    mocks.from.mockReturnValue(chain)

    const res = await getSignatureLook()
    expect(res).toBeNull()
  })

  it('calls clear_signature_look RPC and revalidates /profile', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { success: true, version: 4, cleared: true },
      error: null,
    })

    const res = await clearSignatureLook(3)
    expect(res).toEqual({ success: true, version: 4 })
    expect(mocks.rpc).toHaveBeenCalledWith('clear_signature_look', {
      p_expected_version: 3,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/profile')
  })

  it('handles concurrency conflict 40900 on clearSignatureLook', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '40900', message: 'Signature look modified by concurrent session' },
    })

    await expect(clearSignatureLook(1)).rejects.toThrow(
      'Signature look was modified in another session. Please refresh and try again.',
    )
  })
})

describe('Profile Avatar Upload & Removal Actions', () => {
  it('rejects upload when no avatar file is provided in FormData', async () => {
    const formData = new FormData()
    await expect(uploadAvatarAction(formData)).rejects.toThrow('No avatar image provided')
  })

  it('uploads valid avatar, inserts media_assets, updates user metadata, and returns signed URL', async () => {
    const formData = new FormData()
    const file = new File(['fake-image-bytes'], 'avatar.jpg', { type: 'image/jpeg' })
    formData.append('avatar', file)

    const mediaAssetChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'new-avatar-asset-id' },
        error: null,
      }),
    }

    mocks.from.mockReturnValue(mediaAssetChain)
    mocks.signedUrl.mockResolvedValue('https://signed.media/new-avatar.jpg')

    const res = await uploadAvatarAction(formData)

    expect(mocks.uploadPrivate).toHaveBeenCalled()
    expect(mocks.updateUser).toHaveBeenCalledWith({
      data: { avatar_asset_id: 'new-avatar-asset-id' },
    })
    expect(res).toEqual({
      success: true,
      avatarUrl: 'https://signed.media/new-avatar.jpg',
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/profile')
  })

  it('cleans up newly uploaded storage object if media_assets insert fails', async () => {
    const formData = new FormData()
    const file = new File(['fake-image-bytes'], 'avatar.jpg', { type: 'image/jpeg' })
    formData.append('avatar', file)

    const mediaAssetChain = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'DB connection error' },
      }),
    }

    mocks.from.mockReturnValue(mediaAssetChain)

    await expect(uploadAvatarAction(formData)).rejects.toThrow('DB connection error')
    expect(mocks.deletePrivate).toHaveBeenCalledWith(
      expect.anything(),
      'test-user-id',
      'test-user-id/avatar-new.jpg',
    )
  })

  it('removes avatar, clears user metadata reference, and deletes media asset', async () => {
    mocks.auth.mockResolvedValueOnce({
      data: {
        user: {
          id: 'test-user-id',
          user_metadata: { avatar_asset_id: 'old-avatar-asset-id' },
        },
      },
      error: null,
    })

    const selectChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { object_path: 'test-user-id/old-avatar.jpg' },
        error: null,
      }),
      delete: vi.fn().mockReturnThis(),
    }
    mocks.from.mockReturnValue(selectChain)

    const res = await removeAvatarAction()

    expect(res).toEqual({ success: true })
    expect(mocks.updateUser).toHaveBeenCalledWith({
      data: { avatar_asset_id: null },
    })
    expect(mocks.deletePrivate).toHaveBeenCalledWith(
      expect.anything(),
      'test-user-id',
      'test-user-id/old-avatar.jpg',
    )
    expect(mocks.revalidatePath).toHaveBeenCalledWith('/profile')
  })
})
