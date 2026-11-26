import {gaps,type Gap,type Intent} from './intent'
import {incrementalUnlockCount,type StylistContext} from './recommend'

/** Prefer a useful category with high structural opportunity and low existing redundancy. */
export function discoveryGap(context:StylistContext,intent:Intent):Gap|null {
 const range={work:[0.3,1],'going-out':[0.25,1],everyday:[0,0.8]}[intent.occasion]
 const items=[...new Map(context.items.filter(i=>i.id&&!i.id.startsWith('catalog:')&&
 (typeof i.formality_score!=='number'||!Number.isFinite(i.formality_score)||(i.formality_score>=range[0]&&i.formality_score<=range[1]))).map(i=>[i.id,i])).values()]
 const choices=gaps.map(role=>({role,unlocks:incrementalUnlockCount(items,role),owned:items.filter(i=>i.layer_role===role).length}))
 return choices.filter(c=>c.unlocks>=2).sort((a,b)=>b.unlocks/(1+b.owned)-a.unlocks/(1+a.owned)||a.owned-b.owned||a.role.localeCompare(b.role))[0]?.role??null
}
