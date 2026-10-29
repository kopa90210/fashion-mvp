import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/src/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mocks.auth }, rpc: mocks.rpc, from: mocks.from }),
}))
import { recordOutfitWorn, recordOutfitNotToday } from './outfit-interactions'

const outfitId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
  mocks.rpc.mockImplementation(async (method: string) => {
    if (method === 'record_canonical_outfit_worn') {
      return {
        data: {
          id: 'wear-record-id',
          worn_on: '2026-10-26',
          interaction_id: 'interaction-id',
          replayed: false,
          undone: false,
        },
        error: null,
      }
    }
    if (method === 'record_outfit_interaction') {
      return { data: 'interaction-id', error: null }
    }
    return { data: null, error: null }
  })
})

describe('separate outfit behavioral actions', () => {
  it('records an authenticated wear decision through the single transactional RPC', async () => {
    const result = await recordOutfitWorn(outfitId, 'request-key')
    expect(result).toEqual({
      interactionId: 'interaction-id',
      wearRecordId: 'wear-record-id',
      wornOn: '2026-10-26',
      replayed: false,
      undone: false,
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_canonical_outfit_worn', {
      p_outfit_id: outfitId,
      p_worn_on: null,
      p_idempotency_key: 'request-key',
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('handles replayed wear request returning existing interaction and wear record', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        id: 'wear-record-id',
        worn_on: '2026-10-26',
        interaction_id: 'interaction-id',
        replayed: true,
        undone: false,
      },
      error: null,
    })

    const result = await recordOutfitWorn(outfitId, 'request-key')
    expect(result).toEqual({
      interactionId: 'interaction-id',
      wearRecordId: 'wear-record-id',
      wornOn: '2026-10-26',
      replayed: true,
      undone: false,
    })
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

    const result = await recordOutfitWorn(outfitId, 'old-key')
    expect(result).toEqual({
      interactionId: 'interaction-id',
      wearRecordId: null,
      wornOn: null,
      replayed: true,
      undone: true,
    })
  })

  it('records an authenticated not-today behavioral event', async () => {
    expect(await recordOutfitNotToday(outfitId, 'request-key')).toEqual({ interactionId: 'interaction-id' })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_outfit_interaction', {
      p_outfit_id: outfitId,
      p_event_type: 'outfit_not_today',
      p_idempotency_key: 'request-key',
      p_context_snapshot: {},
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated callers before the RPC', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null }, error: null })
    await expect(recordOutfitWorn(outfitId, 'key')).rejects.toThrow('Not authenticated')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects invalid outfit ids before the RPC', async () => {
    await expect(recordOutfitWorn('invalid-id', 'key')).rejects.toThrow('Invalid outfit')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('rejects invalid idempotency keys before the RPC', async () => {
    await expect(recordOutfitWorn(outfitId, '   ')).rejects.toThrow('Invalid idempotency key')
    await expect(recordOutfitWorn(outfitId, 'a'.repeat(201))).rejects.toThrow('Invalid idempotency key')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it('propagates RPC errors from record_canonical_outfit_worn', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'db error' } })
    await expect(recordOutfitWorn(outfitId, 'key')).rejects.toThrow('Could not record outfit interaction')
  })
})
