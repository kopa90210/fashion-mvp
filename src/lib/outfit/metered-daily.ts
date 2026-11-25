import 'server-only'
import { createHash } from 'node:crypto'
import { decidePersisted } from '@/src/lib/ai/persisted'
import { outfitAdapter } from '@/src/lib/ai/outfit-adapters'
import { isValidOutfitStructure, type WardrobeItem } from './engine'
import type { QuizSignals,StyleVector } from '@/src/lib/quiz/scoring'

export type OutfitSelection = { item_ids: string[]; reasoning: string[]; styling_tip: string|null }
export function validateSelection(raw: unknown, items: WardrobeItem[]): OutfitSelection|null {
  if (!raw || typeof raw!=='object') return null
  const r=raw as Record<string,unknown>
  const ids=r.item_ids
  if(!Array.isArray(ids)||ids.length<2||ids.length>5||!ids.every(id=>typeof id==='string')||new Set(ids).size!==ids.length) return null
  const pool=new Map(items.map(i=>[i.id,i]))
  const selected=ids.map(id=>pool.get(id))
  if(selected.some(i=>!i)||!isValidOutfitStructure(selected as WardrobeItem[])) return null
  if(!Array.isArray(r.reasoning)||r.reasoning.length>3||!r.reasoning.every(x=>typeof x==='string'&&x.length<=240)) return null
  if(r.styling_tip!==null&&(typeof r.styling_tip!=='string'||r.styling_tip.length>240)) return null
  return {item_ids:ids,reasoning:r.reasoning,styling_tip:r.styling_tip}
}
export async function generateMeteredDaily(userId:string,date:string,dna:StyleVector,signals:QuizSignals|null,items:WardrobeItem[],fallback:OutfitSelection|null) {
  // Only bounded garment metadata; never send images, signed URLs, or user ID.
  const sorted=[...items].sort((a,b)=>a.id.localeCompare(b.id))
  const eligible=sorted.slice(0,250).map(i=>({id:i.id,name:i.display_name.slice(0,120),role:i.layer_role,style:i.style_tags,fit:i.fit??null,formality:i.formality_score??null,category:i.category??null,subcategory:i.subcategory??null}))
  const prompt=JSON.stringify({style:dna,preferences:signals,wardrobe:eligible,instructions:'Choose a cohesive look using owned IDs only. Use top+bottom+shoes OR one-piece+shoes; optional one outerwear and one accessory. Consider formality, color and intended use. Do not mix homewear with polished footwear unless justified. Return at most three short reasons.'})
  const hash=createHash('sha256').update(JSON.stringify(['daily-v1',date,prompt])).digest('hex')
  // Stable per local day and context, including wardrobe/style changes.
  const id=hash.slice(0,8)+'-'+hash.slice(8,12)+'-4'+hash.slice(13,16)+'-8'+hash.slice(17,20)+'-'+hash.slice(20,32)
  return decidePersisted({key:{userId,requestId:id,component:'daily_outfit'},fingerprint:hash,
    primary:outfitAdapter('groq',prompt),secondary:outfitAdapter('gemini',prompt),
    validate:v=>validateSelection(v,items),fallback:()=>fallback})
}
