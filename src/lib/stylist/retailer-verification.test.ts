import {describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
import {productFromHtml,verifyRetailerProducts} from './retailer-verification'
import {discoveryGap} from './discovery-gap'
import type {WardrobeItem} from '@/src/lib/outfit/engine'
const intent={mode:'shop',occasion:'work',role:'bottom',budget:1499} as const
const lead={title:'Men chinos',url:'https://www.defacto.com.eg/en-eg/chino-123456',retailer:'www.defacto.com.eg'}
const offer={'@type':'Offer',price:'999',priceCurrency:'EGP',availability:'https://schema.org/InStock',url:lead.url}
const html=(o:object=offer,name='Men chinos')=>'<script type="application/ld+json">'+JSON.stringify({'@type':'Product',name,offers:o})+'</script>'
describe('retailer evidence',()=>{
 it('accepts explicit matching offer',()=>expect(productFromHtml(html(),lead,intent,'masculine')).toMatchObject({priceEgp:999,url:lead.url,role:'bottom'}))
 it.each([{...offer,priceCurrency:'USD'},{...offer,price:'1500'},{...offer,availability:'https://schema.org/OutOfStock'},{...offer,url:'https://example.com'}])('rejects invalid offer',o=>expect(productFromHtml(html(o),lead,intent,'masculine')).toBeNull())
 it('rejects wrong collection or missing evidence',()=>{expect(productFromHtml(html(offer,'Women chinos'),lead,intent,'masculine')).toBeNull();expect(productFromHtml('',lead,intent,'masculine')).toBeNull()})
 it('fails closed on retailer denial',async()=>{const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('',{status:403}));expect(await verifyRetailerProducts([lead],intent,'masculine',fetcher)).toEqual([]);expect(fetcher).toHaveBeenCalledTimes(1)})
})
describe('daily wardrobe gap',()=>{
 it('chooses missing bottoms when two tops and two shoes exist',()=>{
 const items:WardrobeItem[]=[['a','base_layer'],['b','base_layer'],['c','footwear'],['d','footwear']].map(([id,role])=>({id,display_name:id,layer_role:role as WardrobeItem['layer_role'],style_tags:{},image_url:null}))
 expect(discoveryGap({items,dna:{},signals:null},intent)).toBe('bottom')
 })
 it('returns no category when wardrobe has no useful combination',()=>expect(discoveryGap({items:[],dna:{},signals:null},intent)).toBeNull())
})
