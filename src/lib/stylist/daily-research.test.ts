import {describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
import {researchFingerprint,researchTtl} from './daily-research'
import type {StylistContext,Result} from './recommend'
import type {WardrobeItem} from '@/src/lib/outfit/engine'
const item=(id:string):WardrobeItem=>({id,display_name:id,layer_role:'base_layer',style_tags:{},image_url:null})
const context:StylistContext={items:[item('a'),item('b')],dna:{},signals:null}
const sizes={top:'M',bottom:'32',shoe:'EU 42'}
const key=(ctx=context,budget=1000,s=sizes)=>researchFingerprint(ctx,'masculine',budget,s,[],true)
describe('persistent daily research',()=>{
 it('ignores wardrobe row ordering',()=>expect(key({...context,items:[...context.items].reverse()})).toBe(key()))
 it('invalidates when budget, sizes, or wardrobe changes',()=>{
 expect(key(context,1200)).not.toBe(key())
 expect(key(context,1000,{...sizes,top:'L'})).not.toBe(key())
 expect(key({...context,items:[item('a')]})).not.toBe(key())
 expect(key({...context,items:[{...item('a'),display_name:'edited'},item('b')]})).not.toBe(key())
 })
 it('uses short TTL for temporary discovery failures',()=>expect(researchTtl({status:'restyle',looks:[],discovery:{status:'unavailable',leads:[]}})).toBe(300))
 it('caps successful results at six hours',()=>expect(researchTtl({status:'restyle',looks:[]})).toBe(21600))
 it('does not cache expired or invalid retailer evidence',()=>{
 const result=(checkedAt:string)=>({status:'shop',looks:[],suggestion:{product:{checkedAt},looks:[],unlockCount:2}} as Result)
 expect(researchTtl(result('invalid'))).toBe(0)
 expect(researchTtl(result('2020-01-01T00:00:00Z'))).toBe(0)
 expect(researchTtl(result(new Date().toISOString()))).toBe(21600)
 })
})
