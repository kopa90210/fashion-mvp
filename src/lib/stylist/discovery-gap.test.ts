import {describe,it,expect} from 'vitest'
import {discoveryGapChoices,validateGapChoice,discoveryGap} from './discovery-gap'
import type {WardrobeItem} from '@/src/lib/outfit/engine'
const item=(id:string,layer_role:WardrobeItem['layer_role']):WardrobeItem=>({id,display_name:id,layer_role,style_tags:{},image_url:null})
const context={items:[item('top1','base_layer'),item('top2','base_layer'),item('shoe1','footwear'),item('shoe2','footwear')],dna:{},signals:null}
const intent={mode:'shop',occasion:'everyday',role:null,budget:2000} as const
describe('AI wardrobe gap boundary',()=>{
 const choices=discoveryGapChoices(context,intent,'masculine')
 it('permits only structurally eligible roles',()=>expect(validateGapChoice({role:'bottom'},choices)).toEqual({role:'bottom'}))
 it('rejects fabricated categories',()=>expect(validateGapChoice({role:'watch'},choices)).toBeNull())
 it('rejects excluded collection categories',()=>expect(validateGapChoice({role:'one_piece'},choices)).toBeNull())
 it('allows no purchase',()=>expect(validateGapChoice({role:null},choices)).toEqual({role:null}))
 it('has deterministic fallback',()=>expect(discoveryGap(context,intent,'masculine')).toBe('bottom'))
 it('does not accept missing role',()=>expect(validateGapChoice({},choices)).toBeNull())
})
