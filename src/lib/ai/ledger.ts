import 'server-only'
import { createClient } from '@supabase/supabase-js'
import type { Provider } from './orchestrator'

export type Component = 'daily_outfit' | 'calibration' | 'stylist_intent' | 'stylist_selection' | 'daily_finds' | 'unlock_compatibility' | 'wardrobe_analysis' | 'style_transformation' | 'explanation' | 'photo_extraction'
export type DecisionKey = { userId: string; requestId: string; component: Component }
export type Usage = { input: number | null; output: number | null; thought: number | null; latency: number; pricingVersion: string | null; cost: number | null }
export type Terminal = 'accepted' | 'timeout' | 'provider_error' | 'invalid_output'
export type Source = 'PRIMARY_AI' | 'SECONDARY_AI' | 'DETERMINISTIC_FALLBACK' | 'DETERMINISTIC_ONLY' | 'UNAVAILABLE'
const sources = new Set<unknown>(['PRIMARY_AI','SECONDARY_AI','DETERMINISTIC_FALLBACK','DETERMINISTIC_ONLY','UNAVAILABLE'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('AI ledger configuration unavailable')
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}
function args(k: DecisionKey) { return {p_user_id:k.userId,p_request_id:k.requestId,p_component:k.component} }
function deadline(signal?: AbortSignal) { const timeout=AbortSignal.timeout(3000); return signal ? AbortSignal.any([timeout,signal]) : timeout }
export async function beginDecision(k: DecisionKey,fingerprint: string) {
  const {data,error}=await client().rpc('begin_ai_decision',{...args(k),p_fingerprint:fingerprint}).abortSignal(deadline())
  if(error || !data || typeof data !== 'object') throw new Error('AI decision claim unavailable')
  if(data.status==='claimed' && typeof data.token==='string' && uuid.test(data.token)) return {status:'claimed' as const,token:data.token}
  if(data.status==='busy'||data.status==='conflict'||data.status==='expired') return {status:data.status as 'busy'|'conflict'|'expired'}
  if(data.status==='completed' && sources.has(data.source) && Array.isArray(data.attempts)) return {status:'completed' as const,source:data.source as Source,result:data.result as unknown,attempts:data.attempts as unknown[]}
  throw new Error('AI decision claim invalid')
}
export async function reserveAttempt(k: DecisionKey,token: string,slot: 1|2,provider: Provider,model: string,signal?: AbortSignal): Promise<boolean> {
  const {data,error}=await client().rpc('reserve_ai_attempt',{...args(k),p_token:token,p_slot:slot,p_provider:provider,p_model:model}).abortSignal(deadline(signal))
  if(error || typeof data!=='boolean') throw new Error('AI attempt reservation unavailable')
  return data
}
export async function finishAttempt(k: DecisionKey,token: string,slot: 1|2,status: Terminal,usage: Usage): Promise<void> {
  const {data,error}=await client().rpc('finish_ai_attempt',{...args(k),p_token:token,p_slot:slot,p_status:status,p_input:usage.input,p_output:usage.output,p_thought:usage.thought,p_latency:usage.latency,p_pricing_version:usage.pricingVersion,p_cost:usage.cost}).abortSignal(deadline())
  if(error || data!==true) throw new Error('AI attempt completion unavailable')
}
export async function finishDecision(k: DecisionKey,token: string,result: unknown): Promise<Source> {
  const {data,error}=await client().rpc('finish_ai_decision',{...args(k),p_token:token,p_result:result}).abortSignal(deadline())
  if(error || !sources.has(data)) throw new Error('AI decision completion unavailable')
  return data as Source
}
