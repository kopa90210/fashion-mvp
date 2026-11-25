import 'server-only'
import { decide, type Candidate, type Decision, type Provider } from './orchestrator'
import { beginDecision, reserveAttempt, finishAttempt, finishDecision, type DecisionKey, type Usage } from './ledger'

export type Adapter = { provider: Provider; model: string; generate: (signal: AbortSignal, capture: (usage: Omit<Usage,'latency'>) => void) => Promise<unknown> }
export async function decidePersisted<T>(options: {
  key: DecisionKey; fingerprint: string; primary: Adapter | null; secondary: Adapter | null
  validate: (value: unknown) => T | null; fallback: () => T | null
}): Promise<Decision<T> | null> {
  const claim = await beginDecision(options.key, options.fingerprint)
  if (claim.status === 'completed') {
    const value = options.validate(claim.result)
    if (value === null) return null
    const attempts = claim.attempts.flatMap(raw => {
      if (!raw || typeof raw !== 'object') return []
      const a = raw as Record<string,unknown>
      if ((a.provider !== 'groq' && a.provider !== 'gemini') || typeof a.model !== 'string' ||
        (a.status !== 'accepted' && a.status !== 'timeout' && a.status !== 'provider_error' && a.status !== 'invalid_output' && a.status !== 'quota_denied')) return []
      return [{provider:a.provider,model:a.model,outcome:a.status,latencyMs:typeof a.latencyMs==='number'?a.latencyMs:0}] as Decision<T>['provenance']['attempts']
    })
    const accepted = attempts.find(a => a.outcome === 'accepted')
    return {value,provenance:{source:claim.source,provider:accepted?.provider??null,model:accepted?.model??null,attempts}}
  }
  if (claim.status !== 'claimed') return null
  const token = claim.token
  function wrap(adapter: Adapter | null,slot: 1|2): Candidate | null {
    if (!adapter) return null
    let reserved = false
    let ambiguous = false
    let usage: Omit<Usage,'latency'> = {input:null,output:null,thought:null,pricingVersion:null,cost:null}
    return {
      provider:adapter.provider,model:adapter.model,
      async reserve(signal) {
        ambiguous = true
        reserved = await reserveAttempt(options.key,token,slot,adapter.provider,adapter.model,signal)
        ambiguous = false
        return reserved
      },
      generate:signal=>adapter.generate(signal, value=>{if(!signal.aborted) usage=value}),
      async complete(attempt) {
        if (ambiguous) throw new Error('AI reservation outcome unknown')
        if (!reserved) return
        const status = attempt.outcome
        if (status==='quota_denied'||status==='unconfigured') throw new Error('Invalid reserved attempt outcome')
        await finishAttempt(options.key,token,slot,status,{...usage,latency:attempt.latencyMs})
      },
    }
  }
  const decision=await decide({primary:wrap(options.primary,1),secondary:wrap(options.secondary,2),validate:options.validate,fallback:options.fallback})
  const source=await finishDecision(options.key,token,decision.value)
  if(source!==decision.provenance.source) throw new Error('AI provenance mismatch')
  return decision
}
