import 'server-only'
import {createHash} from 'node:crypto'
import {readCatalog,type Product} from './catalog'
import {adultLead} from './fashion-quality'
import {normalizeLeads,type RetailerLead} from './product-discovery'
import type {Collection,Intent} from './intent'

type Obj=Record<string,unknown>
const object=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v)
const roles={base_layer:/\b(shirt|shirts|t-shirt|polo|blouse|sweater|top)\b/i,bottom:/\b(trousers|pants|chinos|jeans)\b/i,one_piece:/\b(dress|jumpsuit)\b/i,footwear:/\b(shoes|sneakers|loafers|boots)\b/i,outerwear:/\b(jacket|coat|blazer|overshirt)\b/i}
export function productFromHtml(html:string,lead:RetailerLead,intent:Intent,collection:Collection,now=Date.now()):Product|null {
 if(!intent.role||!intent.budget||!normalizeLeads({results:[lead]}).length)return null
 const nodes:Obj[]=[]
 for(const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){
  try{
   const v:unknown=JSON.parse(m[1]);const roots=Array.isArray(v)?v:[v]
   for(const x of roots)if(object(x)){nodes.push(x);if(Array.isArray(x['@graph']))nodes.push(...x['@graph'].filter(object))}
  }catch{/* malformed markup is not evidence */}
 }
 const products=nodes.filter(n=>n['@type']==='Product'||(Array.isArray(n['@type'])&&n['@type'].includes('Product')))
 if(products.length!==1)return null
 const p=products[0]
 if(typeof p.name!=='string'||!adultLead(p.name,lead.url,collection,intent.role)||!roles[intent.role].test(p.name)||p.name.length>100)return null
 // Require explicit collection evidence, not the search query.
 const gender=typeof p.audience==='object'&&object(p.audience)?p.audience.suggestedGender:null
 const evidence=String(gender??'')+' '+p.name
 const male=/\b(male|men|man|men's|mens)\b/i.test(evidence)
 const female=/\b(female|women|woman|women's|womens)\b/i.test(evidence)
 if(collection==='masculine'?(!male||female):(!female||male))return null
 const offers=Array.isArray(p.offers)?p.offers:[p.offers]
 const eligible=offers.filter(object).filter(o=>o['@type']==='Offer'&&o.priceCurrency==='EGP'&&o.availability==='https://schema.org/InStock'&&o.url===lead.url)
 const prices=eligible.map(o=>typeof o.price==='number'?o.price:typeof o.price==='string'&&/^\d+(\.\d{1,2})?$/.test(o.price)?Number(o.price):NaN)
 if(!prices.length||prices.some(v=>!Number.isFinite(v)||v<=0)||new Set(prices).size!==1||prices[0]>intent.budget)return null
 const result=readCatalog(JSON.stringify([{id:createHash('sha256').update(lead.url).digest('hex').slice(0,32),title:p.name,url:lead.url,priceEgp:prices[0],currency:'EGP',stock:'in_stock',checkedAt:new Date(now).toISOString(),collection,role:intent.role,occasions:[intent.occasion],styleTags:{}}]),now)[0]
 if(!result)return null
 const imageValue=Array.isArray(p.image)?p.image[0]:p.image
 let imageUrl:string|undefined
 if(typeof imageValue==='string'&&imageValue.length<=1000){
  try{
   const u=new URL(imageValue,lead.url)
   // Restrict direct browser image requests to retailer-owned domains or the retailer's documented CDN hostname.
   const allowed=u.hostname==='www.defacto.com.eg'||u.hostname==='dfcdn.defacto.com.tr'||u.hostname==='www.lcwaikiki.eg'||u.hostname==='concrete.store'
   if(allowed&&u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/\.(?:jpg|jpeg|png|webp)$/i.test(u.pathname))imageUrl=u.href
  }catch{/* no image is better than an untrusted URL */}
 }
 return {...result,liveVerified:true,...(imageUrl?{imageUrl}:{})}
}
export async function verifyRetailerProducts(leads:RetailerLead[],intent:Intent,collection:Collection,fetcher:typeof fetch=fetch):Promise<Product[]>{
 const verified=await Promise.all(leads.slice(0,3).map(async lead=>{
  if(!normalizeLeads({results:[lead]}).length)return null
  try{
   const response=await fetcher(lead.url,{redirect:'error',cache:'no-store',signal:AbortSignal.timeout(3500),headers:{Accept:'text/html'}})
   if(!response.ok||!response.headers.get('content-type')?.includes('text/html')||!response.body)return null
   const reader=response.body.getReader();const decoder=new TextDecoder();let size=0,html=''
   try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000){await reader.cancel();return null}html+=decoder.decode(value,{stream:true})}html+=decoder.decode()}finally{reader.releaseLock()}
   return productFromHtml(html,lead,intent,collection)
  }catch{return null}
 }))
 return verified.filter((p):p is Product=>p!==null)
}
