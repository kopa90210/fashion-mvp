import { describe,expect,it,vi } from 'vitest'
vi.mock('server-only',()=>({}))
vi.mock('@/src/lib/ai/persisted',()=>({decidePersisted:vi.fn()}))
vi.mock('@/src/lib/ai/outfit-adapters',()=>({outfitAdapter:vi.fn(()=>null)}))
import { eligibleStylistItems,validateStylistSelection,meteredStylist } from './metered-stylist'
import { decidePersisted } from '@/src/lib/ai/persisted'
import type { WardrobeItem } from '@/src/lib/outfit/engine'
const items:WardrobeItem[]=[
 {id:'top',display_name:'Polo',image_url:null,layer_role:'base_layer',style_tags:{},formality_score:0.5},
 {id:'pants',display_name:'Trousers',image_url:null,layer_role:'bottom',style_tags:{},formality_score:0.5},
 {id:'shoes',display_name:'Loafers',image_url:null,layer_role:'footwear',style_tags:{},formality_score:0.5}
]
const intent={mode:'restyle',occasion:'work',role:null,budget:null} as const
const selected={item_ids:['top','pants','shoes'],reasoning:['Coherent palette'],styling_tip:null}
describe('metered stylist validation',()=>{
 it('accepts only valid owned combinations',()=>expect(validateStylistSelection(selected,items)).toEqual(selected))
 it.each([['top','pants','foreign'],['top','top','shoes'],['top','pants'],['catalog:fake','pants','shoes']])('rejects invalid selections %j',(...ids)=>expect(validateStylistSelection({...selected,item_ids:ids},items)).toBeNull())
 it('excludes known unsuitable formality, duplicates and catalog entries',()=>{
  expect(eligibleStylistItems([...items,items[0],{...items[0],id:'catalog:test'},{...items[1],id:'lounge',formality_score:0}],intent).map(i=>i.id)).toEqual(['pants','shoes','top'])
 })
 it('rejects malformed explanation',()=>expect(validateStylistSelection({...selected,reasoning:[123]},items)).toBeNull())
 it('returns distinct intent and selection provenance',async()=>{
  const primary={source:'PRIMARY_AI',provider:'gemini',model:'test',attempts:[]} as const
  const secondary={source:'SECONDARY_AI',provider:'gemini',model:'test',attempts:[]} as const
  vi.mocked(decidePersisted).mockResolvedValueOnce({value:intent,provenance:{...primary,attempts:[]}}).mockResolvedValueOnce({value:selected,provenance:{...secondary,attempts:[]}})
  const r=await meteredStylist({userId:'user',requestId:'req',question:'outfit for work from my wardrobe',collection:'masculine',budget:null,context:{items,dna:{},signals:null},catalog:[]})
  expect(r?.provenance.intent.source).toBe('PRIMARY_AI')
  expect(r?.provenance.selection?.source).toBe('SECONDARY_AI')
  expect(r?.looks[0].pieces.every(p=>p.owned)).toBe(true)
 })
})
