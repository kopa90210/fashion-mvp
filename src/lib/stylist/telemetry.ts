export type AiStatus = 'success' | 'invalid_response' | 'http_error' | 'network_error' | 'timeout' | 'invalid_model'
export type AiTelemetry = {
  status: AiStatus
  input: number | null
  output: number | null
  thought: number | null
  latency: number
}
export function tokenCount(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 2147483647 ? value : null
}

/** USD per million tokens. No assumed rate, no estimated zero for unknown usage. */
export function estimateCost(model: string, usage: AiTelemetry, config = process.env.STYLIST_AI_PRICING_JSON): { version: string | null; cost: number | null } {
  const unknown = { version: null, cost: null }
  if (usage.input === null || usage.output === null || usage.thought === null) return unknown
  try {
    const rates = JSON.parse(config || '{}')
    if (!Object.prototype.hasOwnProperty.call(rates, model)) return unknown
    const rate = rates[model]
    if (typeof rate.version !== 'string' || !rate.version || rate.version.length > 80 ||
        typeof rate.inputUsdPerMillion !== 'number' || !Number.isFinite(rate.inputUsdPerMillion) || rate.inputUsdPerMillion < 0 ||
        typeof rate.outputUsdPerMillion !== 'number' || !Number.isFinite(rate.outputUsdPerMillion) || rate.outputUsdPerMillion < 0) return unknown
    const cost = (usage.input * rate.inputUsdPerMillion + (usage.output + usage.thought) * rate.outputUsdPerMillion) / 1_000_000
    if (!Number.isFinite(cost) || cost >= 1_000_000_000) return unknown
    return { version: rate.version, cost: Number(cost.toFixed(9)) }
  } catch { return unknown }
}
