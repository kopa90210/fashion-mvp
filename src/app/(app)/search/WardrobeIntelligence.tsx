'use client'
import {useRef,useState} from 'react'
import Link from 'next/link'
import {targets,type Target} from '@/src/lib/stylist/wardrobe-intelligence'
import type {meteredWardrobe} from '@/src/lib/stylist/metered-wardrobe'
type Result=NonNullable<Awaited<ReturnType<typeof meteredWardrobe>>>
export default function WardrobeIntelligence({analysis,transformation}:{analysis:boolean;transformation:boolean}){
 const [target,setTarget]=useState<Target>('old_money')
 const [result,setResult]=useState<Result|null>(null)
 const [pending,setPending]=useState(false)
 const [error,setError]=useState('')
 const lock=useRef(false)
 const retry=useRef<{body:string;id:string}|null>(null)
 async function run(value:Target|null){
  if(lock.current)return
  lock.current=true;setPending(true);setResult(null);setError('')
  try{
   const body=JSON.stringify({target:value})
   if(retry.current?.body!==body)retry.current={body,id:crypto.randomUUID()}
   const r=await fetch('/api/wardrobe/intelligence',{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':retry.current.id},body})
   const data=await r.json()
   if(!r.ok){setError(typeof data.error==='string'?data.error:'Analysis unavailable');return}
   setResult(data);retry.current=null
  }catch{setError('Analysis unavailable. Try again.')}finally{lock.current=false;setPending(false)}
 }
 return <section className="mt-8 space-y-4 rounded-3xl border border-[#d8cec2] bg-[#fffdfa] p-5">
  <h2 className="font-serif text-3xl">Your wardrobe, understood.</h2>
  {analysis&&<button type="button" disabled={pending} className="min-h-11 rounded-full bg-[#1d1b18] px-4 text-sm text-white" onClick={()=>void run(null)}>Analyze my wardrobe</button>}
  {transformation&&<div className="flex flex-wrap items-end gap-2"><label className="text-sm">Target style<select disabled={pending} className="mt-1 block min-h-11 rounded-xl border px-3" value={target} onChange={e=>{setTarget(e.target.value as Target);setResult(null);setError('')}}>{targets.map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label><button type="button" disabled={pending} className="min-h-11 rounded-full border px-4 text-sm" onClick={()=>void run(target)}>Explore this style</button></div>}
  <div aria-live="polite" aria-busy={pending}>
   {pending&&<p role="status">Reviewing your wardrobe…</p>}
   {error&&<p role="alert">{error}</p>}
   {result&&<div className="space-y-3 text-sm">
    <h3 className="font-medium">{result.target?result.target.replaceAll('_',' '):'Wardrobe analysis'}</h3>
    <p>{result.facts.total} confirmed pieces · {result.facts.structuralPotential} structural core combinations (not a style compatibility count).</p>
    <div className="grid grid-cols-2 gap-2">{Object.entries(result.facts.counts).map(([role,count])=><p key={role}>{role.replaceAll('_',' ')}: {count}</p>)}</div>
    <p dir="auto">{result.advice.summary}</p>
    <ul className="space-y-2">{result.advice.priorities.map((p,i)=><li key={i} dir="auto">{p.role.replaceAll('_',' ')}: {p.reason}</li>)}</ul>
    {!!result.pieces.length&&<ul>{result.pieces.map(p=><li key={p.id} dir="auto">{p.name} · From your wardrobe</li>)}</ul>}
    {!result.facts.total&&<Link className="underline" href="/wardrobe/add">Add confirmed pieces</Link>}
    {!!result.target&&!result.pieces.length&&<p>No complete target-style look was found. Review your existing pieces before buying anything.</p>}
    <details><summary className="cursor-pointer">Generation Inspector</summary><p>Facts: deterministic · Advice: {result.provenance?.source.replaceAll('_',' ')??'Not executed'}</p>{result.provenance?.attempts.map((a,i)=><p key={i}>{a.provider} · {a.model} · {a.outcome} · {a.latencyMs} ms</p>)}</details>
    <p className="text-xs text-[#6d6257]">Based on recorded garment attributes, not visual inspection. Your saved style preferences have not changed.</p>
   </div>}
  </div>
 </section>
}
