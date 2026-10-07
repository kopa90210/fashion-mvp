import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ auth: vi.fn(), rpc: vi.fn(), from: vi.fn() }))
vi.mock('@/src/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.auth }, rpc: mocks.rpc, from: mocks.from }) }))
import { recordOutfitWorn, recordOutfitNotToday } from './outfit-interactions'
const outfitId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ data: { user: { id: 'owner' } }, error: null })
  mocks.rpc.mockResolvedValue({ data: 'interaction-id', error: null })
})
describe('separate outfit behavioral actions', () => {
  it.each([[recordOutfitWorn, 'outfit_worn'], [recordOutfitNotToday, 'outfit_not_today']] as const)('records an authenticated behavioral event through the owner-checking RPC', async (action, eventType) => {
    expect(await action(outfitId, 'request-key')).toEqual({ interactionId: 'interaction-id' })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('record_outfit_interaction', {
      p_outfit_id: outfitId, p_event_type: eventType, p_idempotency_key: 'request-key', p_context_snapshot: {},
    })
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('rejects unauthenticated callers before the RPC', async () => {
    mocks.auth.mockResolvedValue({ data: { user: null }, error: null })
    await expect(recordOutfitWorn(outfitId, 'key')).rejects.toThrow('Not authenticated')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it.each(['', '   ', 'x'.repeat(201)])('rejects invalid idempotency keys before the RPC', async (key) => {
    await expect(recordOutfitNotToday(outfitId, key)).rejects.toThrow('Invalid idempotency key')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects malformed outfit IDs', async () => {
    await expect(recordOutfitWorn('bad-id', 'key')).rejects.toThrow('Invalid outfit')
    expect(mocks.rpc).not.toHaveBeenCalled()
  })
  it('rejects malformed runtime key values and accepts the 200-character boundary', async () => {
    await expect(recordOutfitWorn(outfitId, null as unknown as string)).rejects.toThrow('Invalid idempotency key')
    expect(mocks.rpc).not.toHaveBeenCalled()
    await expect(recordOutfitWorn(outfitId, 'x'.repeat(200))).resolves.toEqual({ interactionId: 'interaction-id' })
  })
  it('does not leak private RPC errors or retry a rejected cross-user request', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'private request context' } })
    await expect(recordOutfitWorn(outfitId, 'key')).rejects.toThrow('Could not record outfit interaction')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.from).not.toHaveBeenCalled()
  })
  it('preserves the replay key and returns the same event identity', async () => {
    const first = await recordOutfitWorn(outfitId, 'same-key')
    const second = await recordOutfitWorn(outfitId, 'same-key')
    expect(second).toEqual(first)
    expect(mocks.rpc.mock.calls.every(([, args]) => args.p_idempotency_key === 'same-key')).toBe(true)
  })
})
