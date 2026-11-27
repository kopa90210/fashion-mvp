import 'server-only'
import {fetchMerchantProducts,merchantHosts,type MerchantId} from './shopify-merchant'
import type {Product} from './catalog'
import type {Intent,Collection} from './intent'
export function enabledMerchants(env:Readonly<Record<string,string|undefined>>=process.env):MerchantId[]{
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='fix/phase6-p0-reliability-cloud'||env.NEXT_PUBLIC_SUPABASE_URL!=='https://xaxwzncbvmxicbnvjfad.supabase.co')return []
 const approved=new Set((env.STYLIST_AUTHORIZED_MERCHANTS??'').split(',').map(s=>s.trim()))
 return (Object.keys(merchantHosts) as MerchantId[]).filter(id=>approved.has(id)&&!!env['STYLIST_SHOPIFY_'+id.toUpperCase()+'_TOKEN']).slice(0,2)
}
export async function searchAuthorizedMerchants(intent:Intent,collection:Collection):Promise<Product[]>{
 const merchants=enabledMerchants()
 if(!merchants.length)return []
 const settled=await Promise.allSettled(merchants.map(id=>fetchMerchantProducts(id,intent,collection)))
 const products=settled.flatMap(r=>r.status==='fulfilled'?r.value:[])
 return [...new Map(products.map(p=>[p.url,p])).values()].slice(0,20)
}
