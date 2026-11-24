import { describe, expect, it } from 'vitest'
import { estimateCost, tokenCount, type AiTelemetry } from './telemetry'
import { classifyWithGemini } from './gemini'
const usage: AiTelemetry = { status: 'success', input: 1000, output: 200, thought: 100, latency: 50 }
const rates = JSON.stringify({ 'test-model': { version: 'synthetic-v1', inputUsdPerMillion: 1, outputUsdPerMillion: 2 } })
describe('stylist telemetry', () => {
  it('prices input, output and reasoning with explicit version', () => {
    expect(estimateCost('test-model', usage, rates)).toEqual({ version: 'synthetic-v1', cost: 0.0016 })
  })
  it('preserves unknown rates or usage', () => {
    expect(estimateCost('unknown', usage, rates).cost).toBeNull()
    expect(estimateCost('test-model', { ...usage, thought: null }, rates).cost).toBeNull()
    expect(estimateCost('test-model', usage, 'invalid').cost).toBeNull()
  })
  it.each([-1, 1.2, '12', Infinity, null])('rejects invalid token count %s', value => {
    expect(tokenCount(value)).toBeNull()
  })
  it('captures structured usage on success', async () => {
    const events: AiTelemetry[] = []
    const fetcher: typeof fetch = async () => Response.json({
      candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ mode: 'restyle', occasion: 'everyday', role: null, budget: null }) }] } }],
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 0 },
    })
    expect(await classifyWithGemini('question', { key: 'test', model: 'test-model', fetcher, onTelemetry: e => events.push(e) })).not.toBeNull()
    expect(events).toEqual([expect.objectContaining({ status: 'success', input: 100, output: 20, thought: 0 })])
  })
  it('captures HTTP failure with unknown usage', async () => {
    const events: AiTelemetry[] = []
    const fetcher: typeof fetch = async () => new Response(null, { status: 503 })
    expect(await classifyWithGemini('question', { key: 'test', model: 'test-model', fetcher, onTelemetry: e => events.push(e) })).toBeNull()
    expect(events).toEqual([expect.objectContaining({ status: 'http_error', input: null, output: null })])
  })
})
