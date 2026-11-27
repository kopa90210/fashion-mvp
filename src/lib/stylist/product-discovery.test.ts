import {describe,it,expect,vi,afterEach} from 'vitest'
vi.mock('server-only',()=>({}))
import {normalizeLeads,discoveryQuery,discoveryEnabled,discoverRetailerLeads} from './product-discovery'
const intent={mode:'shop',occasion:'work',role:'bottom',budget:1499} as const
const env={VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'fix/phase6-p0-reliability-cloud',NEXT_PUBLIC_SUPABASE_URL:'https://xaxwzncbvmxicbnvjfad.supabase.co',TAVILY_API_KEY:'test-only'}
const good={title:'Chinos',url:'https://www.defacto.com.eg/en-eg/chino-123456'}
afterEach(()=>vi.unstubAllEnvs())
describe('retailer discovery',()=>{
 it('accepts unique direct retailer product leads only',()=>{
  expect(normalizeLeads({results:[good,good,{...good,url:'https://evil.example/chino-123456'},{...good,url:'https://www.defacto.com.eg@evil.example/chino-123456'},{...good,url:'https://www.defacto.com.eg/checkout/chino-123456'},{...good,url:'http://www.defacto.com.eg/chino-123456'},{...good,url:'https://concrete.store/collections/trousers'},{...good,url:'https://concrete.store/products/chino?redirect=evil'}]})).toEqual([{...good,retailer:'www.defacto.com.eg'}])
 })
 it('never treats search snippets or model claims as verified price and stock',()=>{
  expect(normalizeLeads({results:[{...good,priceEgp:99,stock:'in_stock',content:'99 EGP'}]})).toEqual([{...good,retailer:'www.defacto.com.eg'}])
 })
 it('requires preview branch and staging database',()=>{
  expect(discoveryEnabled(env)).toBe(true)
  expect(discoveryEnabled({...env,VERCEL_ENV:'production'})).toBe(false)
  expect(discoveryEnabled({...env,VERCEL_GIT_COMMIT_REF:'main'})).toBe(false)
  expect(discoveryEnabled({...env,NEXT_PUBLIC_SUPABASE_URL:'https://other.supabase.co'})).toBe(false)
 })
 it('builds a normalized category and budget query',()=>expect(discoveryQuery(intent,'masculine')).toBe('adult men trousers chinos work Egypt product -kids -boys -girls -teens EGP under 1499 EGP'))
 it('makes exactly one bounded basic search and handles provider rejection',async()=>{
  for(const [k,v] of Object.entries(env))vi.stubEnv(k,v)
  const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify({results:[good]}))).mockResolvedValueOnce(new Response('',{status:429}))
  expect(await discoverRetailerLeads(intent,'masculine',fetcher)).toMatchObject({status:'ok',leads:[good]})
  expect(fetcher).toHaveBeenCalledTimes(1)
  const [url,opts]=fetcher.mock.calls[0]
  expect(url).toBe('https://api.tavily.com/search')
  expect(JSON.parse(String(opts?.body))).toMatchObject({search_depth:'basic',auto_parameters:false,max_results:8,include_answer:false})
  expect(await discoverRetailerLeads(intent,'masculine',fetcher)).toEqual({status:'unavailable',leads:[]})
  expect(fetcher).toHaveBeenCalledTimes(2)
 })
})
