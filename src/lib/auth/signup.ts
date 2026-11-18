// Server-controlled configuration only: never derive email links from Host/Origin headers.
export function appOrigin(): string {
  const configured = process.env.APP_ORIGIN ?? (
    process.env.NODE_ENV !== 'production' ? 'http://localhost:3000' : undefined
  )
  if (!configured) throw new Error('APP_ORIGIN is required')
  const url = new URL(configured)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) ||
      url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('APP_ORIGIN must be an app origin')
  }
  return url.origin
}

export const EMAIL_RATE_LIMIT_MESSAGE = 'Too many confirmation emails have been requested. Please wait before trying again, or check your inbox for an earlier email.'
export const INVALID_CONFIRMATION_MESSAGE = 'This confirmation link has expired or is invalid. Please sign up again to request a new email.'

export function isEmailRateLimit(error: { code?: string; status?: number }): boolean {
  return error.code === 'over_email_send_rate_limit' || error.status === 429
}


// Log only allowlisted metadata: provider messages can contain user data.
export function signupFailure(error: { code?: string; status?: number; name?: string }) {
  const knownCodes = ['weak_password', 'email_address_invalid', 'validation_failed',
    'signup_disabled', 'email_provider_disabled', 'email_address_not_authorized',
    'over_email_send_rate_limit', 'over_request_rate_limit', 'unexpected_failure']
  const code = knownCodes.includes(error.code ?? '') ? error.code! : 'unknown'
  const status = Number.isInteger(error.status) && error.status! >= 0 && error.status! <= 599
    ? error.status! : null
  const unavailable = error.name === 'AuthRetryableFetchError' || status === 0 || (status !== null && status >= 500)
  let message = 'We could not create your account. Please check your details and try again.'
  if (isEmailRateLimit(error)) message = EMAIL_RATE_LIMIT_MESSAGE
  else if (code === 'weak_password') message = 'Please choose a stronger password and try again.'
  else if (code === 'email_address_invalid' || code === 'validation_failed') message = 'Please enter a valid email address and password.'
  else if (unavailable || ['signup_disabled', 'email_provider_disabled', 'email_address_not_authorized'].includes(code)) {
    message = 'Signup is temporarily unavailable. Please try again later.'
  }
  return { message, diagnostic: { operation: 'auth.signUp', code, status, connectionFailure: unavailable } }
}
