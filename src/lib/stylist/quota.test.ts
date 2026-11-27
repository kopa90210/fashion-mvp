import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(), rpc: vi.fn(), abortSignal: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
import { reserveStylistQuota, beginStylistAi, finishStylistAi } from './quota'

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

describe('idempotent AI RPC', () => {
  const token = '22222222-2222-4222-8222-222222222222'
  it('validates a claimed token and forwards the fingerprint', async () => {
    mocks.abortSignal.mockResolvedValue({ data: { status: 'claimed', token }, error: null })
    await expect(beginStylistAi('user-a', 'request-a', 'a'.repeat(64), 'test-model')).resolves.toEqual({ status: 'claimed', token })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('begin_stylist_ai_metered', {
      p_user_id: 'user-a', p_request_id: 'request-a', p_fingerprint: 'a'.repeat(64), p_model: 'test-model',
    })
  })
  it('rejects malformed cached intent', async () => {
    mocks.abortSignal.mockResolvedValue({ data: { status: 'completed', intent: { mode: 'invalid' } }, error: null })
    await expect(beginStylistAi('user-a', 'request-a', 'a'.repeat(64), 'test-model')).rejects.toThrow('claim unavailable')
  })
  it('rejects a lost completion claim without retry', async () => {
    mocks.abortSignal.mockResolvedValue({ data: false, error: null })
    await expect(finishStylistAi('user-a', 'request-a', token, null, 'test-model', { status: 'timeout', input: null, output: null, thought: null, latency: 5000 })).rejects.toThrow('completion unavailable')
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
