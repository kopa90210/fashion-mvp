import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), rpc: vi.fn(), abortSignal: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
import { reserveStylistQuota } from './quota'

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://staging.example')
  vi.stubEnv('SUPABASE_SECRET_KEY', 'test-secret')
  vi.stubEnv('SUPABASE_SERVICE_KEY', '')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '')
  mocks.createClient.mockReturnValue({ rpc: mocks.rpc })
  mocks.rpc.mockReturnValue({ abortSignal: mocks.abortSignal })
  mocks.abortSignal.mockResolvedValue({ data: true, error: null })
})
afterEach(() => vi.unstubAllEnvs())

describe('server-only quota RPC', () => {
  it('reserves for the specified authenticated user and quota type with a bounded signal', async () => {
    await expect(reserveStylistQuota('user-a', 'api_hourly')).resolves.toBe(true)
    expect(mocks.createClient).toHaveBeenCalledWith('https://staging.example', 'test-secret', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('reserve_stylist_quota', {
      p_user_id: 'user-a', p_quota_type: 'api_hourly',
    })
    expect(mocks.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal))
  })

  it('preserves a negative reservation response', async () => {
    mocks.abortSignal.mockResolvedValue({ data: false, error: null })
    await expect(reserveStylistQuota('user-a', 'gemini_daily')).resolves.toBe(false)
  })

  it.each([null, 'true', 1])('rejects unexpected RPC data %s', async (data) => {
    mocks.abortSignal.mockResolvedValue({ data, error: null })
    await expect(reserveStylistQuota('user-a', 'gemini_daily')).rejects.toThrow('quota unavailable')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('does not retry or leak an RPC error', async () => {
    mocks.abortSignal.mockResolvedValue({ data: null, error: { message: 'private detail' } })
    await expect(reserveStylistQuota('user-a', 'gemini_daily')).rejects.toThrow('Stylist quota unavailable')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })

  it('supports the repository legacy service key', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('SUPABASE_SERVICE_KEY', 'legacy-test-key')
    await expect(reserveStylistQuota('user-a', 'api_hourly')).resolves.toBe(true)
    expect(mocks.createClient).toHaveBeenCalledWith('https://staging.example', 'legacy-test-key', expect.anything())
  })

  it('fails closed without server credentials even when anon credentials exist', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-test-key')
    await expect(reserveStylistQuota('user-a', 'api_hourly')).rejects.toThrow('configuration unavailable')
    expect(mocks.createClient).not.toHaveBeenCalled()
  })
})
