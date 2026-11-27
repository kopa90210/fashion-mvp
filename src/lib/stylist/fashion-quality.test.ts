import {describe,it,expect} from 'vitest'
import {adultLead,attributeOverlap,suitableOutfit} from './fashion-quality'
import type {WardrobeItem} from '@/src/lib/outfit/engine'
const item=(display_name:string,layer_role:WardrobeItem['layer_role']):WardrobeItem=>({id:display_name,display_name,layer_role,style_tags:{},image_url:null})
describe('fashion quality',()=>{
 it('rejects boys and teens jacket results',()=>expect(adultLead('Brown BOYS & TEENS Boy Polo Collar Plush Faux Leather Jacket','https://www.defacto.com.eg/jacket-3309022','masculine','outerwear')).toBe(false))
 it('rejects conflicting collection and category',()=>{
 expect(adultLead('Women cotton trousers','https://www.defacto.com.eg/trousers-123456','masculine','bottom')).toBe(false)
 expect(adultLead('Men cotton shirt','https://www.defacto.com.eg/shirt-123456','masculine','bottom')).toBe(false)
 })
 it('allows relevant adult results',()=>expect(adultLead('MAN Beige Regular Fit Cotton Trousers','https://www.defacto.com.eg/trousers-123456','masculine','bottom')).toBe(true))
 it('penalizes same color and subtype',()=>{
 expect(attributeOverlap(item('Black Quilted Bomber Jacket','outerwear'),'Black Bomber Jacket','outerwear')).toBeGreaterThanOrEqual(.8)
 expect(attributeOverlap(item('Black Quilted Bomber Jacket','outerwear'),'Brown Bomber Jacket','outerwear')).toBe(0)
 })
 it('rejects lounge trousers with loafers',()=>expect(suitableOutfit([item('Fluffy Lounge Pants','bottom'),item('Classic Brown Leather Loafers','footwear')])).toBe(false))
 it('keeps compatible everyday alternatives',()=>expect(suitableOutfit([item('Black Trousers','bottom'),item('Classic Brown Leather Loafers','footwear')])).toBe(true))
})
