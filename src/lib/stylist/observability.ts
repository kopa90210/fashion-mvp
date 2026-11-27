export type Stage = 'input' | 'auth' | 'api_quota' | 'wardrobe' | 'ai_claim' | 'provider' | 'ai_finish' | 'recommendation'
export type AiPath = 'not_evaluated' | 'daily_rules' | 'empty_wardrobe' | 'missing_key' | 'invalid_model' | 'cached_intent' | 'cached_null_or_quota' | 'provider_success' | 'provider_fallback' | 'busy' | 'conflict'
export type Outcome = 'disabled' | 'origin_denied' | 'invalid_input' | 'unauthenticated' | 'rate_limited' | 'busy' | 'conflict' | 'configuration_error' | 'success' | 'failure'
export function createStylistMetrics(clock = () => performance.now(), emit = (event: object) => console.info(JSON.stringify(event))) {
  const start = clock()
  let stage: Stage = 'input'
  let stageStart = start
  let finished = false
  const timings: Partial<Record<Stage, number>> = {}
  let aiPath: AiPath = 'not_evaluated'
  let view: 'ask' | 'daily' | 'unknown' = 'unknown'
  const elapsed = (from: number) => Math.max(0, Math.round(clock() - from))
  const closeStage = () => { timings[stage] = (timings[stage] ?? 0) + elapsed(stageStart) }
  return {
    stage(next: Stage) { closeStage(); stage = next; stageStart = clock() },
    aiPath(next: AiPath) { aiPath = next },
    view(next: 'ask' | 'daily') { view = next },
    finish(status: number, outcome: Outcome) {
      if (finished) return
      finished = true
      closeStage()
      const event = {
        event: 'stylist.request', schemaVersion: 1, view, status, outcome, aiPath,
        failureStage: outcome === 'failure' || outcome === 'configuration_error' ? stage : null,
        latencyMs: elapsed(start), timings,
      }
      // Observability must not alter the request outcome.
      try { emit(event) } catch { /* logging failure is nonfatal */ }
    },
  }
}
