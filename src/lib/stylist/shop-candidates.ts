import { recommendOutfits,isValidOutfitStructure,type WardrobeItem } from '@/src/lib/outfit/engine'
import { searchCatalog,type Product } from './catalog'
import { gaps,type Intent,type Collection } from './intent'
import { redundancyPenalty,type StylistContext,type Look } from './recommend'
export type CandidateLook={id:string;items:WardrobeItem[]}
export type ShopCandidate={product:Product;looks:CandidateLook[];penalty:number}
export function shopCandidates(ctx:StylistContext,catalog:Product[],intent:Intent,collection:Collection):ShopCandidate[]{
 const range={work:[0.3,1],'going-out':[0.25,1],everyday:[0,0.8]}[intent.occasion]
 const roles=new Set(['base_layer','bottom','one_piece','footwear'])
 const owned=[...new Map(ctx.items.filter(i=>i.id&&!i.id.startsWith('catalog:')&&roles.has(i.layer_role)&&i.display_name?.trim()&&
 (typeof i.formality_score!=='number'||!Number.isFinite(i.formality_score)||(i.formality_score>=range[0]&&i.formality_score<=range[1]))).map(i=>[i.id,i])).values()]
 const name=(s:string)=>s.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'')
 const names=new Set(ctx.items.map(i=>name(i.display_name)))
 const products=(intent.role?searchCatalog(catalog,intent,collection):gaps.flatMap(role=>searchCatalog(catalog,{...intent,role},collection).slice(0,2))).slice(0,10)
 const occasion={work:'work-university','going-out':'going-out',everyday:'everyday-errands'} as const
 const signals=ctx.signals?{...ctx.signals,primaryOccasion:occasion[intent.occasion]}:null
 return products.flatMap(product=>{
  if(names.has(name(product.title)))return []
  const anchor='catalog:'+product.id
  const candidate:WardrobeItem={id:anchor,display_name:product.title,image_url:null,layer_role:product.role,style_tags:product.styleTags}
  const pool=new Set(owned.map(i=>i.id))
  const seen=new Set<string>()
  const looks:CandidateLook[]=[]
  for(const o of recommendOutfits([...owned,candidate],ctx.dna,{topN:8,anchorItemId:anchor,signals})){
   if(!isValidOutfitStructure(o.items)||!o.items.some(i=>i.id===anchor)||o.items.some(i=>i.id!==anchor&&!pool.has(i.id)))continue
   const key=o.items.map(i=>i.id).sort().join('|')
   if(seen.has(key))continue
   seen.add(key);looks.push({id:'look-'+looks.length,items:o.items})
  }
  return looks.length>=2?[{product,looks,penalty:redundancyPenalty(ctx.items,product)}]:[]
 })
}
export function validateProductChoice(raw:unknown,candidates:ShopCandidate[]):{product_id:string}|null{
 if(!raw||typeof raw!=='object')return null
 const id=(raw as Record<string,unknown>).product_id
 return typeof id==='string'&&candidates.some(c=>c.product.id===id)?{product_id:id}:null
}
export function validateCompatibility(raw:unknown,candidate:ShopCandidate):{look_ids:string[]}|null{
 if(!raw||typeof raw!=='object')return null
 const ids=(raw as Record<string,unknown>).look_ids
 if(!Array.isArray(ids)||ids.length>candidate.looks.length||!ids.every(id=>typeof id==='string'&&candidate.looks.some(l=>l.id===id))||new Set(ids).size!==ids.length)return null
 return {look_ids:ids}
}
export function materializeLooks(candidate:ShopCandidate,ids:string[]):Look[]{
 const selected=new Set(ids)
 return candidate.looks.filter(l=>selected.has(l.id)).map(l=>({pieces:l.items.map(i=>({name:i.display_name,owned:i.id!=='catalog:'+candidate.product.id}))}))
}
