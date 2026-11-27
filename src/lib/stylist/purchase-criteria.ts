import type {Gap} from './intent'
export const purchaseSubtypes={base_layer:['shirt','polo','t-shirt','sweater','blouse'],bottom:['chinos','trousers','jeans'],one_piece:['dress','jumpsuit'],footwear:['sneakers','loafers','boots','shoes'],outerwear:['blazer','overshirt','jacket','coat']} as const
export const purchaseColors=['black','white','cream','beige','brown','navy','grey','olive','blue'] as const
export const purchaseMaterials=['cotton','linen','wool','denim','leather','suede'] as const
export type PurchaseCriteria={subtype:string|null;color:string|null;material:string|null}
export function validateCriteria(raw:unknown,role:Gap):PurchaseCriteria|null {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return null
 const r=raw as Record<string,unknown>
 const valid=(v:unknown,allowed:readonly string[]):v is string|null=>v===null||(typeof v==='string'&&allowed.includes(v))
 if(!valid(r.subtype,purchaseSubtypes[role])||!valid(r.color,purchaseColors)||!valid(r.material,purchaseMaterials))return null
 return {subtype:r.subtype,color:r.color,material:r.material}
}
