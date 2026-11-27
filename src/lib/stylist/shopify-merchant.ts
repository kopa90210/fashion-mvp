import 'server-only'
import {createHash} from 'node:crypto'
import {adultLead} from './fashion-quality'
import type {Product} from './catalog'
import type {Intent,Collection} from './intent'

export const merchantHosts={ravin:'shop.iravin.com',townteam:'townteam.com',or:'or-egypt.com',concrete:'concrete.store',mobaco:'www.mobaco.com',rasport:'rasport.store'} as const
export type MerchantId=keyof typeof merchantHosts
const names={ravin:'Ravin',townteam:'Town Team',or:'OR',concrete:'Concrete',mobaco:'Mobaco',rasport:'RA Sport'} as const
export type MerchantOffer=Omit<Product,'brand'>&{brand:typeof names[MerchantId]}
type Obj=Record<string,unknown>
const obj=(v:unknown):v is Obj=>!!v&&typeof v==='object'&&!Array.isArray(v)
export function normalizeMerchantProducts(raw:unknown,merchant:MerchantId,intent:Intent,collection:Collection,now=Date.now()):MerchantOffer[]{
 if(!intent.role||!intent.budget||intent.budget<1||!obj(raw)||!obj(raw.data)||!obj(raw.data.products)||!Array.isArray(raw.data.products.nodes)||raw.errors)return []
 const host=merchantHosts[merchant],seen=new Set<string>(),out:MerchantOffer[]=[]
 for(const p of raw.data.products.nodes.slice(0,20)){
  if(!obj(p)||typeof p.id!=='string'||!/^gid:\/\/shopify\/Product\/\d+$/.test(p.id)||typeof p.title!=='string'||p.title.length>100||typeof p.handle!=='string'||!(/^[a-z0-9][a-z0-9-]{0,150}$/).test(p.handle)||p.availableForSale!==true)continue
  const url='https://'+host+'/products/'+p.handle
  if(p.onlineStoreUrl!==url||!adultLead(p.title,url,collection,intent.role)||seen.has(p.id))continue
  const evidence=p.title+' '+String(p.productType??'')+' '+(Array.isArray(p.tags)?p.tags.filter(x=>typeof x==='string').join(' '):'')
  const male=/\b(men|man|male|mens)\b/i.test(evidence),female=/\b(women|woman|female|womens|ladies)\b/i.test(evidence)
  if(!adultLead(evidence,url,collection,intent.role)||(collection==='masculine'?(!male||female):(!female||male)))continue
  if(!obj(p.variants)||!Array.isArray(p.variants.nodes)||!obj(p.variants.pageInfo)||p.variants.pageInfo.hasNextPage!==false)continue
  const variants=p.variants.nodes.filter(obj).filter(v=>v.availableForSale===true)
  const prices=variants.map(v=>obj(v.price)&&v.price.currencyCode==='EGP'&&typeof v.price.amount==='string'&&/^\d+(\.\d{1,2})?$/.test(v.price.amount)?Number(v.price.amount):NaN)
  if(!prices.length||prices.some(v=>!Number.isFinite(v)||v<=0||v>intent.budget!)||new Set(prices).size!==1)continue
  let imageUrl:string|undefined
  if(obj(p.featuredImage)&&typeof p.featuredImage.url==='string')try{const u=new URL(p.featuredImage.url);if(u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname===host||u.hostname==='cdn.shopify.com'))imageUrl=u.href}catch{/* optional image */}
  seen.add(p.id)
  out.push({id:createHash('sha256').update(merchant+':'+p.id).digest('hex').slice(0,32),title:p.title,brand:names[merchant],url,priceEgp:prices[0],checkedAt:new Date(now).toISOString(),collection,role:intent.role,occasions:[intent.occasion],styleTags:{},liveVerified:true,...(imageUrl?{imageUrl}:{})})
 }
 return out
}
/** Only explicitly authorized merchant integrations, on the isolated staging branch. */
export async function fetchMerchantProducts(merchant:MerchantId,intent:Intent,collection:Collection,fetcher:typeof fetch=fetch):Promise<MerchantOffer[]>{
 if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!=='fix/phase6-p0-reliability-cloud'||process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://xaxwzncbvmxicbnvjfad.supabase.co')return []
 const approved=(process.env.STYLIST_AUTHORIZED_MERCHANTS??'').split(',').map(s=>s.trim())
 if(!approved.includes(merchant)||!intent.role||!intent.budget||intent.budget<1)return []
 const token=process.env['STYLIST_SHOPIFY_'+merchant.toUpperCase()+'_TOKEN']
 if(!token)return []
 const roles={base_layer:'shirt',bottom:'trousers',one_piece:'dress',footwear:'shoes',outerwear:'jacket'}
 const query='query Products($search:String!) @inContext(country:EG){products(first:20,query:$search){nodes{id title handle productType tags onlineStoreUrl availableForSale featuredImage{url} variants(first:50){nodes{availableForSale price{amount currencyCode}} pageInfo{hasNextPage}}}}}'
 try{
 const response=await fetcher('https://'+merchantHosts[merchant]+'/api/2026-10/graphql.json',{method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json','Shopify-Storefront-Private-Token':token},body:JSON.stringify({query,variables:{search:roles[intent.role]}})})
 if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body)return []
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,body=''
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000){await reader.cancel();return []}body+=decoder.decode(value,{stream:true})}body+=decoder.decode()}finally{reader.releaseLock()}
 return normalizeMerchantProducts(JSON.parse(body),merchant,intent,collection)
 }catch{return []}
}
