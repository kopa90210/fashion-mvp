import {createHash} from 'node:crypto'
import type {Product} from './catalog'
import type {StylistContext} from './recommend'
import type {Intent,Collection} from './intent'
import type {ShopCandidate} from './shop-candidates'
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]))
 return value
}
export function compatibilityFingerprint(args:{context:StylistContext;catalog:Product[];candidate:ShopCandidate;intent:Intent;collection:Collection;prompt:string;instruction:string;models:(string|null)[]}){
 const {context,catalog,candidate,intent,collection,prompt,instruction,models}=args
 return createHash('sha256').update(JSON.stringify(canonical({version:'compat-v2',wardrobe:[...context.items].sort((a,b)=>a.id.localeCompare(b.id)).map(({image_url,...item})=>{void image_url;return item}),dna:context.dna,signals:context.signals,catalog:[...catalog].sort((a,b)=>a.id.localeCompare(b.id)),candidate:candidate.product.id,lookIds:candidate.looks.map(l=>({id:l.id,items:l.items.map(i=>i.id)})),intent,collection,prompt,instruction,models}))).digest('hex')
}
export function catalogExpiry(catalog:Product[]):string{
 return new Date(Math.min(...catalog.map(p=>Date.parse(p.checkedAt)+48*3600000))).toISOString()
}
