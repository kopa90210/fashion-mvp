import { describe,expect,it } from 'vitest'
import {shopCandidates,validateProductChoice,validateCompatibility,materializeLooks,validateCreativeShoppingLooks,materializeCreativeShoppingLooks} from './shop-candidates'
import {readCatalog,inspectCatalog} from './catalog'
import type {WardrobeItem} from '@/src/lib/outfit/engine'
const items:WardrobeItem[]=[
 {id:'t1',display_name:'White shirt',image_url:null,layer_role:'base_layer',style_tags:{}},
 {id:'t2',display_name:'Blue polo',image_url:null,layer_role:'base_layer',style_tags:{}},
 {id:'b1',display_name:'Jeans',image_url:null,layer_role:'bottom',style_tags:{}},
 {id:'s1',display_name:'Loafers',image_url:null,layer_role:'footwear',style_tags:{}}
]
const now=Date.now()
const raw={id:'p1',title:'Tailored trousers',url:'https://concrete.store/products/test-trousers',priceEgp:900,currency:'EGP',stock:'in_stock',checkedAt:new Date(now).toISOString(),collection:'masculine',role:'bottom',occasions:['work'],styleTags:{}}
const catalog=readCatalog(JSON.stringify([raw,{...raw,id:'expensive',url:'https://concrete.store/products/expensive',priceEgp:2000},{...raw,id:'wrong',url:'https://concrete.store/products/wrong',collection:'feminine'},{...raw,id:'stale',url:'https://concrete.store/products/stale',checkedAt:new Date(now-49*3600000).toISOString()}]),now)
const intent={mode:'shop',occasion:'work',role:'bottom',budget:1000} as const
const candidates=()=>shopCandidates({items,dna:{},signals:null},catalog,intent,'masculine')
describe('bounded shopping candidates',()=>{
 it('filters stale, wrong collection and over-budget products',()=>expect(candidates().map(c=>c.product.id)).toEqual(['p1']))
 it('requires at least two distinct owned combinations',()=>expect(candidates()[0].looks.length).toBeGreaterThanOrEqual(2))
 it('rejects invented product IDs',()=>expect(validateProductChoice({product_id:'fake'},candidates())).toBeNull())
 it('ignores model-supplied price and URL',()=>expect(validateProductChoice({product_id:'p1',priceEgp:1,url:'https://fake.invalid'},candidates())).toEqual({product_id:'p1'}))
 it('rejects invented or duplicated look IDs',()=>{const c=candidates()[0];expect(validateCompatibility({look_ids:['fake']},c)).toBeNull();expect(validateCompatibility({look_ids:[c.looks[0].id,c.looks[0].id]},c)).toBeNull()})
 it('accepts zero compatible looks without inventing a count',()=>expect(validateCompatibility({look_ids:[]},candidates()[0])).toEqual({look_ids:[]}))
 it('materializes only sampled combinations with one new product',()=>{const c=candidates()[0];const result=materializeLooks(c,[c.looks[0].id]);expect(result).toHaveLength(1);expect(result[0].pieces.filter(p=>!p.owned)).toHaveLength(1)})
 it('does not recommend without a budget',()=>expect(shopCandidates({items,dna:{},signals:null},catalog,{...intent,budget:null},'masculine')).toEqual([]))
})

describe('catalog aggregate diagnostics',()=>{
 it('distinguishes missing and malformed catalog input',()=>{
  expect(inspectCatalog(undefined,now).diagnostics.input).toBe('missing')
  expect(inspectCatalog('{',now).diagnostics.input).toBe('invalid')
 })
 it('counts accepted and rejected entries without relaxing freshness or stock checks',()=>{
  const entries=[raw,{...raw,id:'expired',checkedAt:new Date(now-49*3600000).toISOString()},
   {...raw,id:'unavailable',stock:'out_of_stock'},{...raw,id:'duplicate'},
   {...raw,id:'unsafe',url:'https://example.com/product'},null]
  const result=inspectCatalog(JSON.stringify(entries),now)
  expect(result.products.map(p=>p.id)).toEqual(['p1'])
  expect(result.diagnostics).toEqual({input:'ok',total:6,accepted:1,invalidFields:2,staleOrInvalidDate:1,invalidOrDuplicateUrl:2})
 })
})

describe('AI creative shopping boundary',()=>{
 const product=catalog[0],anchor='catalog:p1'
 const first=['t1',anchor,'s1'],second=['t2',anchor,'s1']
 it('accepts distinct original outfits',()=>expect(validateCreativeShoppingLooks({outfits:[first,second]},items,product)).toEqual({outfits:[first,second]}))
 it.each([[['t1',anchor,'foreign']],[['t1','b1','s1']],[['t1',anchor,anchor,'s1']],[first,[...first].reverse()],[['t1','t2',anchor,'s1']]])('rejects unsupported combinations %j',(outfits)=>expect(validateCreativeShoppingLooks({outfits},items,product)).toBeNull())
 it('rejects accessory-only variations',()=>{
 const owned=[...items,{id:'a1',display_name:'Belt',layer_role:'accessory' as const,image_url:null,style_tags:{}}]
 expect(validateCreativeShoppingLooks({outfits:[first,[...first,'a1']]},owned,product)).toBeNull()
 })
 it('materializes names from inventory, not model prose',()=>{
 const result=materializeCreativeShoppingLooks([first],items,product)
 expect(result[0].pieces.map(p=>p.name)).toEqual(['White shirt','Tailored trousers','Loafers'])
 expect(result[0].pieces.filter(p=>!p.owned)).toHaveLength(1)
 })
 it('accepts abstention',()=>expect(validateCreativeShoppingLooks({outfits:[]},items,product)).toEqual({outfits:[]}))
})
