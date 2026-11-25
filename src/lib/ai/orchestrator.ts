export type Provider = 'groq' | 'gemini'
export type Failure = 'timeout' | 'provider_error' | 'invalid_output' | 'quota_denied' | 'unconfigured'
export type Attempt = { provider: Provider; model: string; outcome: 'accepted' | Failure; latencyMs: number }
export type Provenance = {
  source: 'PRIMARY_AI' | 'SECONDARY_AI' | 'DETERMINISTIC_FALLBACK' | 'DETERMINISTIC_ONLY' | 'UNAVAILABLE'
  provider: Provider | null
  model: string | null
  cached?: boolean
  attempts: Attempt[]
}
export type Candidate = {
  provider: Provider
  model: string
  // Must reserve one durable, idempotent provider-call allowance before each attempt.
  reserve: (signal: AbortSignal) => Promise<boolean>
  generate: (signal: AbortSignal) => Promise<unknown>
  complete?: (attempt: Attempt) => Promise<void>
}
export type Decision<T> = { value: T | null; provenance: Provenance }

/** No provider retries here. Adapters must honor abort and disable SDK retries.
 * Reservation ambiguity fails closed: never call a provider after a failed reservation.
 * Callers must persist/replay the decision under their feature-specific idempotency key.
 */
export async function decide<T>(options: {
  primary: Candidate | null
  secondary: Candidate | null
  validate: (value: unknown) => T | null
  fallback: () => T | null
  timeoutMs?: number
  totalTimeoutMs?: number
}): Promise<Decision<T>> {
  const attempts: Attempt[] = []
  const bound = (n: number | undefined, defaultValue: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.max(1, Math.min(max, Math.floor(n))) : defaultValue
  const deadline = performance.now() + bound(options.totalTimeoutMs, 8000, 30000)
  const timeout = bound(options.timeoutMs, 3500, 15000)
  let invoked = false
  for (const [index, candidate] of [options.primary, options.secondary].entries()) {
    if (!candidate) continue
    const start = performance.now()
    const remaining = Math.floor(deadline - start)
    if (remaining <= 0) break
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    let outcome: Attempt['outcome'] = 'provider_error'
    let accepted: T | null = null
    try {
      const task = async () => {
        if (!await candidate.reserve(controller.signal)) {
          outcome = 'quota_denied'
          return null
        }
        if (controller.signal.aborted) return null
        invoked = true
        const raw = await candidate.generate(controller.signal)
        if (controller.signal.aborted) return null
        const result = options.validate(raw)
        outcome = result === null ? 'invalid_output' : 'accepted'
        return result
      }
      const result = await Promise.race([
        task(),
        new Promise<null>(resolve => {
          timer = setTimeout(() => { controller.abort(); resolve(null) }, Math.min(timeout, remaining))
        }),
      ])
      if (controller.signal.aborted) outcome = 'timeout'
      accepted = !controller.signal.aborted ? result : null
    } catch {
      outcome = controller.signal.aborted ? 'timeout' : 'provider_error'
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      controller.abort()
    }
    const attempt: Attempt = { provider: candidate.provider, model: candidate.model, outcome, latencyMs: Math.max(0, Math.round(performance.now() - start)) }
    // Persist the outcome before advancing. An ambiguous ledger write must stop the cascade.
    await candidate.complete?.(attempt)
    attempts.push(attempt)
    if (accepted !== null) return { value: accepted, provenance: { source: index === 0 ? 'PRIMARY_AI' : 'SECONDARY_AI', provider: candidate.provider, model: candidate.model, attempts } }
  }
  const value = options.fallback()
  return { value, provenance: { source: value === null ? 'UNAVAILABLE' : invoked ? 'DETERMINISTIC_FALLBACK' : 'DETERMINISTIC_ONLY', provider: null, model: null, attempts } }
}
