import {describe,it,expect} from 'vitest'
import {wardrobeFacts,validateAdvice,fallbackAdvice} from './wardrobe-intelligence'
import type {WardrobeItem} from '@/src/lib/outfit/engine'
const items:WardrobeItem[]=[
{id:'t',display_name:'Polo',image_url:null,layer_role:'base_layer',style_tags:{old_money:.8}},
{id:'b',display_name:'Trousers',image_url:null,layer_role:'bottom',style_tags:{old_money:.8}},
{id:'s',display_name:'Loafers',image_url:null,layer_role:'footwear',style_tags:{old_money:.8}}
]
const context={items,dna:{classic:1},signals:null}
describe('wardrobe intelligence',()=>{
 it('deduplicates and excludes catalog pieces from structural facts',()=>{
 const f=wardrobeFacts({...context,items:[...items,items[0],{...items[0],id:'catalog:x'}]})
 expect(f.total).toBe(3);expect(f.structuralPotential).toBe(1)
 })
 it('rejects foreign garment evidence',()=>expect(validateAdvice({summary:'test',priorities:[{role:'bottom',reason:'test',item_ids:['foreign']}],item_ids:[]},items,null)).toBeNull())
 it('rejects mismatched role evidence',()=>expect(validateAdvice({summary:'test',priorities:[{role:'bottom',reason:'test',item_ids:['t']}],item_ids:[]},items,null)).toBeNull())
 it('rejects incomplete target outfit',()=>expect(validateAdvice({summary:'test',priorities:[],item_ids:['t','b']},items,'old_money')).toBeNull())
 it('accepts complete owned target outfit',()=>expect(validateAdvice({summary:'test',priorities:[],item_ids:['t','b','s']},items,'old_money')?.item_ids).toHaveLength(3))
 it('keeps original DNA unchanged during transformation',()=>{const result=fallbackAdvice(context,'old_money');expect(result.item_ids).toHaveLength(3);expect(context.dna).toEqual({classic:1})})
 it('handles small wardrobe without fictional items',()=>{const result=fallbackAdvice({...context,items:[]},'old_money');expect(result.item_ids).toEqual([]);expect(result.priorities).toHaveLength(3)})
})
