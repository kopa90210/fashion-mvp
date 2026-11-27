import { describe, expect, it, vi } from 'vitest'
import { createStylistMetrics } from './observability'
describe('stylist metrics', () => {
  it('records stages and emits exactly once', () => {
    let time = 0
    const emit = vi.fn()
    const metrics = createStylistMetrics(() => time, emit)
    metrics.view('ask')
    time = 5
    metrics.stage('auth')
    time = 20
    metrics.stage('provider')
    metrics.aiPath('provider_fallback')
    time = 100
    metrics.finish(200, 'success')
    metrics.finish(503, 'failure')
    expect(emit).toHaveBeenCalledExactlyOnceWith({
      event: 'stylist.request', schemaVersion: 1, view: 'ask', status: 200, outcome: 'success',
      aiPath: 'provider_fallback', failureStage: null, latencyMs: 100,
      timings: { input: 5, auth: 15, provider: 80 },
    })
  })
  it('identifies the failing dependency without exposing error content', () => {
    const emit = vi.fn()
    const metrics = createStylistMetrics(() => 0, emit)
    metrics.stage('ai_finish')
    metrics.finish(503, 'failure')
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ failureStage: 'ai_finish', outcome: 'failure' }))
  })
  it('does not break requests if the log sink fails', () => {
    const metrics = createStylistMetrics(() => 0, () => { throw new Error('sink failure') })
    expect(() => metrics.finish(200, 'success')).not.toThrow()
  })
})
