import {tokenCount} from '@/src/lib/stylist/telemetry'
import type {Provider} from './orchestrator'
export function providerCost(provider:Provider,model:string,usage:{input:number|null;output:number|null;thought:number|null},config=process.env.METERED_AI_PRICING_JSON){
 const unknown={pricingVersion:null,cost:null}
 const input=tokenCount(usage.input),output=tokenCount(usage.output),thought=tokenCount(usage.thought)
 if(input===null||output===null||(provider==='gemini'&&thought===null))return unknown
 try{
  const rates=JSON.parse(config||'{}'),key=provider+':'+model
  if(!Object.hasOwn(rates,key))return unknown
  const r=rates[key]
  if(typeof r.version!=='string'||!r.version.trim()||r.version.length>80||![r.inputUsdPerMillion,r.outputUsdPerMillion].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0))return unknown
  // Groq completion_tokens already includes reasoning; Gemini candidates excludes thoughts.
  const billableOutput=output+(provider==='gemini'?(thought??0):0)
  const cost=(input*r.inputUsdPerMillion+billableOutput*r.outputUsdPerMillion)/1000000
  if(!Number.isFinite(cost)||cost>=1000000000)return unknown
  return {pricingVersion:r.version,cost:Number(cost.toFixed(9))}
 }catch{return unknown}
}
