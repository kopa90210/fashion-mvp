import type {Gap} from './intent'
export type ShoppingSizes={top:string;bottom:string;shoe:string}
export function parseShoppingSizes(raw:unknown):ShoppingSizes|null {
 if(raw===undefined)return {top:'',bottom:'',shoe:''}
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const value=raw as Record<string,unknown>
 const sizes={top:'',bottom:'',shoe:''}
 for(const key of ['top','bottom','shoe'] as const){
  const v=value[key]??''
  if(typeof v!=='string'||v.length>12)return null
  const normalized=v.trim().toUpperCase().replace(/[٠-٩]/g,d=>String(d.charCodeAt(0)-1632))
  if(normalized&&!/^(?:(?:XXS|XS|S|M|L|XL|XXL|XXXL|[2-5]XL)|(?:(?:EU|UK|US|W) ?)?[0-9]{1,2}(?:\.[05])?)$/.test(normalized))return null
  sizes[key]=normalized
 }
 return sizes
}
export function requestedSize(sizes:ShoppingSizes,role:Gap|null):string|null {
 if(role==='footwear')return sizes.shoe||null
 if(role==='bottom')return sizes.bottom||null
 if(role==='base_layer'||role==='outerwear'||role==='one_piece')return sizes.top||null
 return null
}
