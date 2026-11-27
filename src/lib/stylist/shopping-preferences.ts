import type {Collection} from './intent'
import {parseShoppingSizes,type ShoppingSizes} from './shopping-sizes'
export type ShoppingPreferences={collection:Collection;budget:number;sizes:ShoppingSizes}
export function parseShoppingPreferences(raw:unknown):ShoppingPreferences|null{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const p=raw as Record<string,unknown>
 if(p.collection!=='masculine'&&p.collection!=='feminine')return null
 if(typeof p.budget!=='number'||!Number.isInteger(p.budget)||p.budget<1||p.budget>100000)return null
 const sizes=parseShoppingSizes(p.sizes)
 return sizes?{collection:p.collection,budget:p.budget,sizes}:null
}
export function preferencesEnabled(env:Readonly<Record<string,string|undefined>>=process.env):boolean{
 return env.VERCEL_ENV==='preview'&&env.VERCEL_GIT_COMMIT_REF==='fix/phase6-p0-reliability-cloud'&&env.NEXT_PUBLIC_SUPABASE_URL==='https://xaxwzncbvmxicbnvjfad.supabase.co'
}
