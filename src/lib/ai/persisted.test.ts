import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('server-only',()=>({}))
const mocks=vi.hoisted(()=>({beginDecision:vi.fn(),reserveAttempt:vi.fn(),finishAttempt:vi.fn(),finishDecision:vi.fn()}))
vi.mock('./ledger',()=>mocks)
import { decidePersisted,type Adapter } from './persisted'
const key={userId:'user',requestId:'request',component:'daily_outfit' as const}
const token='claim'
const validate=(v:unknown)=>v==='owned'?v:null
const fallback=()=> 'engine'
function adapter(provider:Adapter['provider'],value:unknown):Adapter {
 return {provider,model:provider+'-test',generate:vi.fn(async()=>value)}
}
describe('durable provider cascade integration',()=>{
 beforeEach(()=>{
  vi.resetAllMocks()
  mocks.beginDecision.mockResolvedValue({status:'claimed',token})
  mocks.reserveAttempt.mockResolvedValue(true)
  mocks.finishAttempt.mockResolvedValue(undefined)
 })
 it('persists primary acceptance and skips secondary',async()=>{
  const primary=adapter('groq','owned'),secondary=adapter('gemini','owned')
  mocks.finishDecision.mockResolvedValue('PRIMARY_AI')
  const result=await decidePersisted({key,fingerprint:'a',primary,secondary,validate,fallback})
  expect(result?.provenance.source).toBe('PRIMARY_AI')
  expect(mocks.reserveAttempt).toHaveBeenCalledTimes(1)
  expect(secondary.generate).not.toHaveBeenCalled()
  expect(mocks.finishAttempt).toHaveBeenCalledWith(key,token,1,'accepted',expect.any(Object))
 })
 it('records invalid primary before reserving secondary',async()=>{
  const primary=adapter('groq','foreign'),secondary=adapter('gemini','owned')
  mocks.finishDecision.mockResolvedValue('SECONDARY_AI')
  const result=await decidePersisted({key,fingerprint:'a',primary,secondary,validate,fallback})
  expect(result?.provenance.source).toBe('SECONDARY_AI')
  expect(mocks.finishAttempt).toHaveBeenNthCalledWith(1,key,token,1,'invalid_output',expect.any(Object))
  expect(mocks.finishAttempt.mock.invocationCallOrder[0]).toBeLessThan(mocks.reserveAttempt.mock.invocationCallOrder[1])
 })
 it('records both rejected attempts then deterministic output',async()=>{
  mocks.finishDecision.mockResolvedValue('DETERMINISTIC_FALLBACK')
  const result=await decidePersisted({key,fingerprint:'a',primary:adapter('groq',null),secondary:adapter('gemini',null),validate,fallback})
  expect(result?.value).toBe('engine')
  expect(result?.provenance.source).toBe('DETERMINISTIC_FALLBACK')
  expect(mocks.finishDecision).toHaveBeenCalledWith(key,token,'engine')
 })
 it('does not call providers after quota denial',async()=>{
  const primary=adapter('groq','owned'),secondary=adapter('gemini','owned')
  mocks.reserveAttempt.mockResolvedValue(false)
  mocks.finishDecision.mockResolvedValue('DETERMINISTIC_ONLY')
  expect((await decidePersisted({key,fingerprint:'a',primary,secondary,validate,fallback}))?.provenance.source).toBe('DETERMINISTIC_ONLY')
  expect(primary.generate).not.toHaveBeenCalled()
  expect(secondary.generate).not.toHaveBeenCalled()
 })
 it('fails closed if primary completion is ambiguous',async()=>{
  mocks.finishAttempt.mockRejectedValueOnce(new Error('db failure'))
  const secondary=adapter('gemini','owned')
  await expect(decidePersisted({key,fingerprint:'a',primary:adapter('groq',null),secondary,validate,fallback})).rejects.toThrow('db failure')
  expect(secondary.generate).not.toHaveBeenCalled()
  expect(mocks.finishDecision).not.toHaveBeenCalled()
 })
 it('replays validated persisted provider result without charging again',async()=>{
  mocks.beginDecision.mockResolvedValue({status:'completed',source:'SECONDARY_AI',result:'owned',attempts:[{provider:'gemini',model:'test',status:'accepted',latencyMs:1}]})
  const result=await decidePersisted({key,fingerprint:'a',primary:adapter('groq','owned'),secondary:adapter('gemini','owned'),validate,fallback})
  expect(result?.provenance.provider).toBe('gemini')
  expect(mocks.reserveAttempt).not.toHaveBeenCalled()
 })
 it('does not accept stale replay with invalid ownership',async()=>{
  mocks.beginDecision.mockResolvedValue({status:'completed',source:'PRIMARY_AI',result:'foreign',attempts:[]})
  expect(await decidePersisted({key,fingerprint:'a',primary:null,secondary:null,validate,fallback})).toBeNull()
 })
 it('rejects mismatched persisted source',async()=>{
  mocks.finishDecision.mockResolvedValue('SECONDARY_AI')
  await expect(decidePersisted({key,fingerprint:'a',primary:adapter('groq','owned'),secondary:null,validate,fallback})).rejects.toThrow('provenance mismatch')
 })
})
