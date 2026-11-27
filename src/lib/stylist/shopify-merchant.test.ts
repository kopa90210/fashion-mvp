import {describe,it,expect,vi} from 'vitest'
vi.mock('server-only',()=>({}))
import {normalizeMerchantProducts,fetchMerchantProducts} from './shopify-merchant'
import {enabledMerchants} from './merchant-search'
import type {Intent} from './intent'
const intent:Intent={mode:'shop',occasion:'work',role:'bottom',budget:1000}
const product={id:'gid://shopify/Product/123',title:'Men Navy Chinos',handle:'men-navy-chinos',productType:'Men trousers',tags:['Men'],onlineStoreUrl:'https://shop.iravin.com/products/men-navy-chinos',availableForSale:true,featuredImage:{url:'https://cdn.shopify.com/test.jpg'},variants:{nodes:[{availableForSale:true,price:{amount:'800.00',currencyCode:'EGP'}}],pageInfo:{hasNextPage:false}}}
const payload=(p:unknown)=>({data:{products:{nodes:[p]}}})
const normalize=(p:unknown)=>normalizeMerchantProducts(payload(p),'ravin',intent,'masculine')
describe('merchant inventory boundary',()=>{
 it('normalizes eligible merchant evidence',()=>expect(normalize(product)[0]).toMatchObject({brand:'Ravin',priceEgp:800,liveVerified:true,role:'bottom',imageUrl:'https://cdn.shopify.com/test.jpg'}))
 it.each([{availableForSale:false},{onlineStoreUrl:'https://evil.example/products/men-navy-chinos'},{title:'Boys Chinos'},{title:'Men Jacket',handle:'men-jacket',onlineStoreUrl:'https://shop.iravin.com/products/men-jacket'},{variants:{...product.variants,pageInfo:{hasNextPage:true}}},{variants:{...product.variants,nodes:[{availableForSale:true,price:{amount:'800',currencyCode:'USD'}}]}},{variants:{...product.variants,nodes:[{availableForSale:true,price:{amount:'1001',currencyCode:'EGP'}}]}},{variants:{...product.variants,nodes:[{availableForSale:true,price:{amount:'800',currencyCode:'EGP'}},{availableForSale:true,price:{amount:'900',currencyCode:'EGP'}}]}},{variants:{...product.variants,nodes:[...product.variants.nodes,{}]}}])('rejects unverified offer %j',change=>expect(normalize({...product,...change})).toEqual([]))
 it('never uses unauthorized image hosts',()=>expect(normalize({...product,featuredImage:{url:'https://evil.example/a.jpg'}})[0].imageUrl).toBeUndefined())
 it('does not enable merchants in production',()=>expect(enabledMerchants({VERCEL_ENV:'production',STYLIST_AUTHORIZED_MERCHANTS:'ravin',STYLIST_SHOPIFY_RAVIN_TOKEN:'test'})).toEqual([]))
 it('requires authorization and a token on the isolated preview',()=>{
 const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'fix/phase6-p0-reliability-cloud',NEXT_PUBLIC_SUPABASE_URL:'https://xaxwzncbvmxicbnvjfad.supabase.co',STYLIST_AUTHORIZED_MERCHANTS:'ravin,townteam',STYLIST_SHOPIFY_RAVIN_TOKEN:'test'}
 expect(enabledMerchants(env)).toEqual(['ravin'])
 expect(enabledMerchants({...env,STYLIST_AUTHORIZED_MERCHANTS:''})).toEqual([])
 })
 it('does not make unauthorized requests',async()=>{const fetcher=vi.fn<typeof fetch>();expect(await fetchMerchantProducts('ravin',intent,'masculine',fetcher)).toEqual([]);expect(fetcher).not.toHaveBeenCalled()})
})
