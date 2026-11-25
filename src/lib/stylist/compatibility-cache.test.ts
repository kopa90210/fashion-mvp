import {describe,it,expect} from 'vitest'
import {compatibilityFingerprint,catalogExpiry} from './compatibility-cache'
import type {Product} from './catalog'
import type {WardrobeItem} from '@/src/lib/outfit/engine'
const item:WardrobeItem={id:'a',display_name:'Top',layer_role:'base_layer',image_url:null,style_tags:{classic:1}}
const product:Product={id:'p',title:'Trousers',url:'https://concrete.store/products/test',priceEgp:900,brand:'Concrete',checkedAt:'2026-11-25T00:00:00Z',collection:'masculine',role:'bottom',occasions:['work'],styleTags:{}}
const base={context:{items:[item],dna:{classic:1},signals:null},catalog:[product],candidate:{product,looks:[{id:'look-0',items:[item]}],penalty:0},intent:{mode:'shop',occasion:'work',role:'bottom',budget:1000} as const,collection:'masculine' as const,prompt:'p',instruction:'i',models:['g','m']}
describe('compatibility cache key',()=>{
 it('is stable for equal content',()=>expect(compatibilityFingerprint(structuredClone(base))).toBe(compatibilityFingerprint(base)))
 it('invalidates on wardrobe edit or removal',()=>{expect(compatibilityFingerprint({...base,context:{...base.context,items:[]}})).not.toBe(compatibilityFingerprint(base));expect(compatibilityFingerprint({...base,context:{...base.context,items:[{...item,display_name:'Changed'}]}})).not.toBe(compatibilityFingerprint(base))})
 it('invalidates on catalog revision',()=>expect(compatibilityFingerprint({...base,catalog:[{...product,priceEgp:901}]})).not.toBe(compatibilityFingerprint(base)))
 it('invalidates on model or prompt change',()=>{expect(compatibilityFingerprint({...base,models:['new','m']})).not.toBe(compatibilityFingerprint(base));expect(compatibilityFingerprint({...base,instruction:'new'})).not.toBe(compatibilityFingerprint(base))})
 it('invalidates on target and DNA changes',()=>{expect(compatibilityFingerprint({...base,intent:{...base.intent,occasion:'everyday'}})).not.toBe(compatibilityFingerprint(base));expect(compatibilityFingerprint({...base,context:{...base.context,dna:{minimal:1}}})).not.toBe(compatibilityFingerprint(base))})
 it('bounds expiry by oldest catalog record',()=>expect(catalogExpiry([product,{...product,checkedAt:'2026-11-24T00:00:00Z'}])).toBe('2026-11-26T00:00:00.000Z'))
})
