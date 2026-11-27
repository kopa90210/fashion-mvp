import { describe, expect, it, vi } from 'vitest'
import { decide, type Candidate } from './orchestrator'

const candidate = (provider: Candidate['provider'], value: unknown): Candidate => ({
  provider, model: provider + '-test', reserve: vi.fn(async () => true), generate: vi.fn(async () => value),
})
const validate = (value: unknown) => typeof value === 'string' && value === 'owned-look' ? value : null
const fallback = () => 'engine-look'

describe('AI provider cascade', () => {
  it('accepts primary and never calls secondary', async () => {
    const primary = candidate('groq', 'owned-look')
    const secondary = candidate('gemini', 'owned-look')
    const result = await decide({ primary, secondary, validate, fallback })
    expect(result.value).toBe('owned-look')
    expect(result.provenance.source).toBe('PRIMARY_AI')
    expect(secondary.reserve).not.toHaveBeenCalled()
  })
  it('rejects invalid primary and accepts secondary', async () => {
    const result = await decide({ primary: candidate('groq', 'unknown-id'), secondary: candidate('gemini', 'owned-look'), validate, fallback })
    expect(result.provenance.source).toBe('SECONDARY_AI')
    expect(result.provenance.attempts.map(a => a.outcome)).toEqual(['invalid_output', 'accepted'])
  })
  it('falls back after provider error and invalid output', async () => {
    const primary = candidate('groq', null)
    primary.generate = vi.fn(async () => { throw new Error('private provider detail') })
    const result = await decide({ primary, secondary: candidate('gemini', {}), validate, fallback })
    expect(result.value).toBe('engine-look')
    expect(result.provenance.source).toBe('DETERMINISTIC_FALLBACK')
    expect(result.provenance.attempts.map(a => a.outcome)).toEqual(['provider_error', 'invalid_output'])
    expect(JSON.stringify(result)).not.toContain('private provider detail')
  })
  it('never invokes either provider without quota', async () => {
    const primary = candidate('groq', 'owned-look')
    const secondary = candidate('gemini', 'owned-look')
    primary.reserve = secondary.reserve = vi.fn(async () => false)
    const result = await decide({ primary, secondary, validate, fallback })
    expect(primary.generate).not.toHaveBeenCalled()
    expect(secondary.generate).not.toHaveBeenCalled()
    expect(result.provenance.source).toBe('DETERMINISTIC_ONLY')
    expect(result.provenance.attempts.map(a => a.outcome)).toEqual(['quota_denied', 'quota_denied'])
  })
  it('fails closed on ambiguous reservation', async () => {
    const primary = candidate('groq', 'owned-look')
    primary.reserve = vi.fn(async () => { throw new Error('database timeout') })
    const result = await decide({ primary, secondary: null, validate, fallback })
    expect(primary.generate).not.toHaveBeenCalled()
    expect(result.provenance.source).toBe('DETERMINISTIC_ONLY')
  })
  it('aborts a stalled primary before using secondary', async () => {
    const primary = candidate('groq', null)
    let signal: AbortSignal | undefined
    primary.generate = vi.fn(async s => { signal = s; return new Promise(() => {}) })
    const result = await decide({ primary, secondary: candidate('gemini', 'owned-look'), validate, fallback, timeoutMs: 20, totalTimeoutMs: 1000 })
    expect(signal?.aborted).toBe(true)
    expect(result.provenance.source).toBe('SECONDARY_AI')
    expect(result.provenance.attempts[0].outcome).toBe('timeout')
  })
  it('does not fabricate a result when fallback is unavailable', async () => {
    const result = await decide({ primary: null, secondary: null, validate, fallback: () => null })
    expect(result.value).toBeNull()
    expect(result.provenance.source).toBe('UNAVAILABLE')
  })
})
