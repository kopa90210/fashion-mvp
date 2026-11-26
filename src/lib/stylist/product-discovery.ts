import 'server-only'
import type { Intent, Collection } from './intent'

const hosts = ['www.defacto.com.eg','www.lcwaikiki.eg','concrete.store'] as const
export type RetailerLead = { title:string; url:string; retailer:string }
export type Discovery = { status:'ok'|'unavailable'|'disabled'; leads:RetailerLead[] }
const categories = {base_layer:'shirts tops',bottom:'trousers chinos',one_piece:'dresses jumpsuits',footwear:'shoes',outerwear:'jackets coats'} as const
export function discoveryQuery(intent:Intent,collection:Collection):string {
 return [collection==='masculine'?'men':'women',intent.role?categories[intent.role]:'clothing wardrobe basics',intent.occasion,'Egypt', 'product', 'EGP', 'under '+intent.budget+' EGP'].join(' ')
}
export function normalizeLeads(raw:unknown):RetailerLead[] {
 if(!raw||typeof raw!=='object'||!('results' in raw)||!Array.isArray(raw.results))return []
 const found=new Map<string,RetailerLead>()
 for(const entry of raw.results.slice(0,8)){
  if(!entry||typeof entry!=='object'||typeof entry.url!=='string'||entry.url.length>500||typeof entry.title!=='string')continue
  let u:URL
  try{u=new URL(entry.url)}catch{continue}
  if(u.protocol!=='https:'||u.username||u.password||u.port||u.search||u.hash||!hosts.some(h=>h===u.hostname))continue
  if(/%(?:2f|5c|00|2e)/i.test(u.pathname))continue
  // Require known product-shaped paths; do not accept search/category pages.
  const productPath=u.hostname==='concrete.store'? /^\/products\/[a-z0-9][a-z0-9-]+\/?$/i.test(u.pathname)
    : /(?:^|\/)[^/]+-\d{5,}\/?$/i.test(u.pathname)
  if(!productPath||/(?:^|\/)(?:login|account|cart|checkout|redirect|search|collections|category|categories)(?:\/|$)/i.test(u.pathname))continue
  const title=entry.title.trim().slice(0,160)
  if(!title||found.has(u.href))continue
  found.set(u.href,{title,url:u.href,retailer:u.hostname})
 }
 return [...found.values()].slice(0,5)
}
export function discoveryEnabled(env:NodeJS.ProcessEnv=process.env):boolean {
 return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF==='fix/phase6-p0-reliability-cloud'&&env.NEXT_PUBLIC_SUPABASE_URL==='https://xaxwzncbvmxicbnvjfad.supabase.co'&&!!env.TAVILY_API_KEY
}
export async function discoverRetailerLeads(intent:Intent,collection:Collection,fetcher:typeof fetch=fetch):Promise<Discovery>{
 if(!discoveryEnabled()||intent.mode!=='shop'||!intent.budget||intent.budget<1)return {status:'disabled',leads:[]}
 try{
  const res=await fetcher('https://api.tavily.com/search',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{Authorization:'Bearer '+process.env.TAVILY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({query:discoveryQuery(intent,collection),search_depth:'basic',auto_parameters:false,max_results:8,include_domains:hosts,include_answer:false,include_raw_content:false})})
  if(!res.ok){console.info(JSON.stringify({event:'stylist.discovery',status:'provider_error',httpStatus:res.status}));return {status:'unavailable',leads:[]}}
  const leads=normalizeLeads(await res.json())
  console.info(JSON.stringify({event:'stylist.discovery',status:'ok',count:leads.length}))
  return {status:'ok',leads}
 }catch{console.info(JSON.stringify({event:'stylist.discovery',status:'unavailable'}));return {status:'unavailable',leads:[]}}
}
