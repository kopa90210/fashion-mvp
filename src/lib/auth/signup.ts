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
