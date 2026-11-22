import { afterEach, expect, it, vi } from 'vitest'
import { runtimeCatalog } from './catalog'
import { eventRequest } from './event'
import { eventRecommendation } from './recommend'
afterEach(() => vi.unstubAllEnvs())
it('serves non-purchasable fixtures only in the designated staging preview', () => {
  vi.stubEnv('VERCEL_ENV','preview')
  vi.stubEnv('STYLIST_DEMO_CATALOG','true')
  vi.stubEnv('VERCEL_GIT_COMMIT_REF','feat/stylist-daily-needs')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL','https://xaxwzncbvmxicbnvjfad.supabase.co')
  vi.stubEnv('STYLIST_CATALOG_JSON','[]')
  const catalog = runtimeCatalog()
  expect(catalog).toHaveLength(3)
  expect(catalog.every(x=>x.demo && !x.url && !x.checkedAt)).toBe(true)
  const req = eventRequest('عندي انترفيو النهارده')!
  const ctx = {items: [
    {id:'a',display_name:'Blue shirt',layer_role:'base_layer' as const},
    {id:'b',display_name:'Trousers',layer_role:'bottom' as const},
  ].map(x=>({...x,image_url:null,style_tags:{},formality_score:0.8})),dna:{},signals:null}
  expect(eventRecommendation(ctx,catalog,req,'masculine',1000).suggestion?.product.id).toBe('demo-loafers')
  expect(eventRecommendation(ctx,catalog,req,'masculine',800).suggestion).toBeUndefined()
  vi.stubEnv('VERCEL_ENV','production')
  expect(runtimeCatalog()).toEqual([])
})
