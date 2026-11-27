import 'server-only'
import {createHash} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {preferencesEnabled} from './shopping-preferences'
import type {ShoppingSizes} from './shopping-sizes'
import type {Collection} from './intent'
import type {StylistContext,Result} from './recommend'
import type {Product} from './catalog'

function canonical(v:unknown):unknown {
 if(Array.isArray(v))return v.map(canonical)
 if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]))
 return v
}
export function researchFingerprint(context:StylistContext,collection:Collection,budget:number|null,sizes:ShoppingSizes,catalog:Product[],live:boolean):string {
 const items=[...context.items].sort((a,b)=>a.id.localeCompare(b.id))
 return createHash('sha256').update(JSON.stringify(canonical(['research-v1',new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),items,context.dna,context.signals,collection,budget,sizes,catalog,live,process.env.ENABLE_METERED_SHOPPER_AI,process.env.ENABLE_METERED_STYLIST_AI]))).digest('hex')
}
function client(){
 if(!preferencesEnabled())throw new Error('Research cache disabled')
 const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY
 if(!key)throw new Error('Research cache configuration unavailable')
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
}
export type ResearchClaim={status:'claimed';token:string}|{status:'busy'}|{status:'completed';result:Result;checkedAt:string}
export async function claimResearch(userId:string,fingerprint:string):Promise<ResearchClaim>{
 const {data,error}=await client().rpc('claim_stylist_research',{p_user_id:userId,p_fingerprint:fingerprint}).abortSignal(AbortSignal.timeout(3000))
 if(error||!data)throw new Error('Research claim unavailable')
 if(data.status==='busy')return {status:'busy'}
 if(data.status==='claimed'&&typeof data.token==='string'&&/^[0-9a-f-]{36}$/i.test(data.token))return {status:'claimed',token:data.token}
 if(data.status==='completed'&&data.result&&Array.isArray(data.result.looks)&&['restyle','shop','no-match','empty','clarify'].includes(data.result.status)&&typeof data.checkedAt==='string'&&Number.isFinite(Date.parse(data.checkedAt)))return {status:'completed',result:data.result,checkedAt:data.checkedAt}
 throw new Error('Invalid research claim')
}
export function researchTtl(result:Result):number{
 if(result.discovery?.status==='unavailable'||result.discovery?.status==='disabled')return 300
 if(result.suggestion){
  const remaining=Math.floor((Date.parse(result.suggestion.product.checkedAt)+48*3600000-Date.now())/1000)
  return Number.isFinite(remaining)?Math.max(0,Math.min(21600,remaining)):0
 }
 return 21600
}
export async function finishResearch(userId:string,token:string,result:Result|null):Promise<boolean>{
 const ttl=result?researchTtl(result):60
 const {data,error}=await client().rpc('finish_stylist_research',{p_user_id:userId,p_token:token,p_result:ttl<60?null:result,p_ttl_seconds:Math.max(ttl,60)}).abortSignal(AbortSignal.timeout(3000))
 return !error&&data===true
}
