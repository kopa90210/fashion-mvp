import { NextResponse } from 'next/server'
import { createClient } from '@/src/lib/supabase/server'
import { EMAIL_RATE_LIMIT_MESSAGE, INVALID_CONFIRMATION_MESSAGE, isEmailRateLimit } from '@/src/lib/auth/signup'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const tokenHash = url.searchParams.get('token_hash')
  // Never forward tokens or a caller-supplied redirect destination.
  const destination = new URL('/signup', url.origin)
  let message = INVALID_CONFIRMATION_MESSAGE
  if (tokenHash) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })
    if (!error && data.session) {
      const response = NextResponse.redirect(new URL('/quiz', url.origin))
      response.headers.set('Cache-Control', 'no-store')
      response.headers.set('Referrer-Policy', 'no-referrer')
      return response
    }
    if (error && isEmailRateLimit(error)) message = EMAIL_RATE_LIMIT_MESSAGE
  }
  destination.searchParams.set('error', message)
  const response = NextResponse.redirect(destination)
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
