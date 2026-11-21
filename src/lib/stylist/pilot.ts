// Local development can use any signed-in test account. Deployed runtimes
// require an explicit cohort even if the main feature flag is enabled.
export function pilotAllows(userId: string, cohort = process.env.STYLIST_PILOT_USER_IDS): boolean {
  if (cohort === undefined) return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
  return cohort.split(',').some((id) => id.trim() === userId)
}

type PilotEvent = {
  view: 'ask' | 'daily'
  outcome: 'restyle' | 'shop' | 'clarify' | 'no-match' | 'empty' | 'unavailable'
  elapsedMs: number
  catalog: 'not-needed' | 'empty' | 'ready'
  intent: 'gemini' | 'rules' | 'not-used' | 'fallback' | 'unknown'
}

export function recordPilotEvent(event: PilotEvent): void {
  if (process.env.STYLIST_PILOT_METRICS !== 'true') return
  console.info(JSON.stringify({ event: 'stylist_pilot', ...event }))
}
