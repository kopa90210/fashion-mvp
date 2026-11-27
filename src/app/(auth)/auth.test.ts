import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ signUp: vi.fn(), signInWithPassword: vi.fn(), verifyOtp: vi.fn(), revalidate: vi.fn(), onboarding: vi.fn() }))
vi.mock('@/src/lib/supabase/server', () => ({ createClient: async () => ({ auth: mocks, from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.onboarding})})}) }) }))
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }))
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`) } }))

import { signup, login } from './actions'
import SignupPage from './signup/page'
import { GET } from '../auth/confirm/route'
import { appOrigin, EMAIL_RATE_LIMIT_MESSAGE, INVALID_CONFIRMATION_MESSAGE } from '@/src/lib/auth/signup'

function form() {
  const data = new FormData()
  data.set('email', 'person@example.test')
  data.set('password', 'test-password')
  return data
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('APP_ORIGIN', 'https://preview.example.test')
})
afterEach(() => vi.unstubAllEnvs())

describe('email signup', () => {
  it('shows Check your email with no session and uses the configured origin', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error: null })
    await expect(signup(form())).rejects.toThrow('REDIRECT:/signup?status=check-email')
    expect(mocks.signUp).toHaveBeenCalledExactlyOnceWith({
      email: 'person@example.test', password: 'test-password',
      options: { emailRedirectTo: 'https://preview.example.test/auth/confirm' },
    })
    expect(mocks.revalidate).not.toHaveBeenCalled()
    const html = renderToStaticMarkup(await SignupPage({ searchParams: Promise.resolve({ status: 'check-email' }) }))
    expect(html).toContain('Check your email')
    expect(html).not.toContain('type="submit"')
  })

  it('redirects to quiz only when signup returns a session', async () => {
    mocks.signUp.mockResolvedValue({ data: { session: { access_token: 'test' } }, error: null })
    await expect(signup(form())).rejects.toThrow('REDIRECT:/quiz')
    expect(mocks.revalidate).toHaveBeenCalledWith('/', 'layout')
  })

  it.each([{ code: 'over_email_send_rate_limit' }, { status: 429 }])('shows rate limit guidance without retrying: %j', async (error) => {
    mocks.signUp.mockResolvedValue({ data: { session: null }, error })
    await expect(signup(form())).rejects.toThrow('REDIRECT:/signup?error=' + encodeURIComponent(EMAIL_RATE_LIMIT_MESSAGE))
    expect(mocks.signUp).toHaveBeenCalledTimes(1)
    expect(mocks.revalidate).not.toHaveBeenCalled()
    const html = renderToStaticMarkup(await SignupPage({ searchParams: Promise.resolve({ error: EMAIL_RATE_LIMIT_MESSAGE }) }))
    expect(html).toContain('role="alert"')
    expect(html).toContain('Please wait before trying again')
  })

  it.each([
    [{ code: 'weak_password', status: 422 }, 'Please choose a stronger password'],
    [{ code: 'email_address_invalid', status: 422 }, 'Please enter a valid email'],
    [{ name: 'AuthRetryableFetchError', status: 0 }, 'Signup is temporarily unavailable'],
    [{ code: 'unexpected_failure', status: 500 }, 'Signup is temporarily unavailable'],
  ])('shows actionable signup failures without retrying: %j', async (error, message) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mocks.signUp.mockResolvedValue({ data: { session: null }, error: {
        ...error, message: 'sensitive-provider-body', headers: { apikey: 'sensitive-key' },
      } })
      await expect(signup(form())).rejects.toThrow(encodeURIComponent(message))
      expect(mocks.signUp).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith('Signup failed:', expect.objectContaining({ operation: 'auth.signUp', status: error.status }))
      expect(JSON.stringify(log.mock.calls)).not.toContain('sensitive')
    } finally { log.mockRestore() }
  })

  it('preserves password login', async () => {
    mocks.signInWithPassword.mockResolvedValue({ data:{user:{id:'test-user'}}, error: null })
    mocks.onboarding.mockResolvedValue({data:{has_completed_calibration:false},error:null})
    await expect(login(form())).rejects.toThrow('REDIRECT:/quiz')
    expect(mocks.signInWithPassword).toHaveBeenCalledExactlyOnceWith({ email: 'person@example.test', password: 'test-password' })
    expect(mocks.signUp).not.toHaveBeenCalled()
  })

  it('routes completed accounts directly to outfits after password login',async()=>{
    mocks.signInWithPassword.mockResolvedValue({data:{user:{id:'returning-user'}},error:null})
    mocks.onboarding.mockResolvedValue({data:{has_completed_calibration:true},error:null})
    await expect(login(form())).rejects.toThrow('REDIRECT:/outfits')
    expect(mocks.onboarding).toHaveBeenCalledOnce()
  })

  it('does not assume an account is new when onboarding lookup fails',async()=>{
    mocks.signInWithPassword.mockResolvedValue({data:{user:{id:'returning-user'}},error:null})
    mocks.onboarding.mockResolvedValue({data:null,error:{message:'unavailable'}})
    await expect(login(form())).rejects.toThrow('Could not read onboarding status')
  })

  it('rejects an unsafe or missing hosted app origin before signup', async () => {
    vi.stubEnv('APP_ORIGIN', 'https://attacker.test/path')
    await expect(signup(form())).rejects.toThrow('Signup%20is%20temporarily%20unavailable')
    expect(mocks.signUp).not.toHaveBeenCalled()
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('APP_ORIGIN', undefined)
    expect(() => appOrigin()).toThrow('APP_ORIGIN is required')
  })
})

describe('email confirmation', () => {
  it('verifies email OTP using the cookie client and redirects without leaking token or next', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: { access_token: 'test' } }, error: null })
    const response = await GET(new Request('https://preview.example.test/auth/confirm?token_hash=secret-token&type=recovery&next=https://attacker.test'))
    expect(mocks.verifyOtp).toHaveBeenCalledExactlyOnceWith({ token_hash: 'secret-token', type: 'email' })
    expect(response.headers.get('location')).toBe('https://preview.example.test/quiz')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
  })

  it.each(['otp_expired', 'validation_failed'])('shows a friendly error for %s', async (code) => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { code } })
    const response = await GET(new Request('https://preview.example.test/auth/confirm?token_hash=secret-token'))
    const location = new URL(response.headers.get('location')!)
    expect(location.pathname).toBe('/signup')
    expect(location.searchParams.get('error')).toBe(INVALID_CONFIRMATION_MESSAGE)
    expect(location.search).not.toContain('secret-token')
  })

  it('does not verify missing tokens or accept a success without a session', async () => {
    const missing = await GET(new Request('https://preview.example.test/auth/confirm'))
    expect(new URL(missing.headers.get('location')!).pathname).toBe('/signup')
    expect(mocks.verifyOtp).not.toHaveBeenCalled()
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: null })
    const noSession = await GET(new Request('https://preview.example.test/auth/confirm?token_hash=test'))
    expect(new URL(noSession.headers.get('location')!).pathname).toBe('/signup')
  })

  it('handles confirmation 429 without retrying', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { status: 429 } })
    const response = await GET(new Request('https://preview.example.test/auth/confirm?token_hash=test'))
    expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe(EMAIL_RATE_LIMIT_MESSAGE)
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1)
  })
})
