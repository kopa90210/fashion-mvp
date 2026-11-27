import { STYLE_DIMENSIONS,type StyleDimension } from '@/src/lib/quiz/scoring'
import { recommendOutfits,isValidOutfitStructure,type WardrobeItem } from '@/src/lib/outfit/engine'
import type { StylistContext } from './recommend'
export const targets=STYLE_DIMENSIONS
export type Target=StyleDimension
export type Advice={summary:string;priorities:{role:string;reason:string;item_ids:string[]}[];item_ids:string[]}
const roles=['base_layer','bottom','one_piece','footwear','outerwear','accessory'] as const
export function wardrobeFacts(context:StylistContext){
 const items=[...new Map(context.items.filter(i=>i.id&&!i.id.startsWith('catalog:')&&roles.includes(i.layer_role)&&i.display_name?.trim()).map(i=>[i.id,i])).values()].sort((a,b)=>a.id.localeCompare(b.id)).slice(0,250)
 const counts=Object.fromEntries(roles.map(r=>[r,items.filter(i=>i.layer_role===r).length]))
 return {items,counts,total:items.length,structuralPotential:(counts.base_layer*counts.bottom+counts.one_piece)*counts.footwear}
}
export function validateAdvice(raw:unknown,items:WardrobeItem[],target:Target|null):Advice|null{
 if(!raw||typeof raw!=='object')return null
 const r=raw as Record<string,unknown>,pool=new Map(items.map(i=>[i.id,i]))
 const ids=(v:unknown):v is string[]=>Array.isArray(v)&&v.length<=5&&v.every(x=>typeof x==='string'&&pool.has(x))&&new Set(v).size===v.length
 const short=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=240
 if(!short(r.summary)||!ids(r.item_ids)||!Array.isArray(r.priorities)||r.priorities.length>3)return null
 if(target&&r.item_ids.length&&!isValidOutfitStructure(r.item_ids.map(id=>pool.get(id)!)))return null
 if(!target&&r.item_ids.length)return null
 const priorities:Advice['priorities']=[]
 for(const p of r.priorities){
  if(!p||typeof p!=='object'||!roles.includes(p.role)||!short(p.reason)||!ids(p.item_ids)||p.item_ids.some((id:string)=>pool.get(id)?.layer_role!==p.role))return null
  priorities.push({role:p.role,reason:p.reason,item_ids:p.item_ids})
 }
 return {summary:r.summary,priorities,item_ids:r.item_ids}
}
export function fallbackAdvice(context:StylistContext,target:Target|null):Advice{
 const {items,counts}=wardrobeFacts(context)
 const priorities:Advice['priorities']=[]
 if(!counts.footwear)priorities.push({role:'footwear',reason:'Confirm footwear to build complete looks.',item_ids:[]})
 if(!counts.one_piece&&!counts.base_layer)priorities.push({role:'base_layer',reason:'Confirm tops or one-piece garments.',item_ids:[]})
 if(!counts.one_piece&&!counts.bottom)priorities.push({role:'bottom',reason:'Confirm bottoms or one-piece garments.',item_ids:[]})
 const outfit=target?recommendOutfits(items,{[target]:1},{topN:1})[0]:null
 return {summary:target?'An owned outfit ranked using your target style tags, where available.':'Review your confirmed wardrobe coverage before adding new pieces.',priorities,item_ids:outfit?.items.map(i=>i.id)??[]}
}
