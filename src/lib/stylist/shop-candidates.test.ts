import { describe,expect,it } from 'vitest'
import {shopCandidates,validateProductChoice,validateCompatibility,materializeLooks} from './shop-candidates'
import {readCatalog} from './catalog'
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
