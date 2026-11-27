import type {Collection,Gap} from './intent'
import type {WardrobeItem} from '@/src/lib/outfit/engine'
const child=/\b(boys?|girls?|teens?|teenage|kids?|children|child|junior|baby|toddler|infant|youth)\b|أطفال|اطفال|ولادي|بناتي/i
const male=/\b(men|man|male|mens)\b|رجالي/i
const female=/\b(women|woman|female|womens|ladies)\b|حريمي|نسائي/i
const rolePatterns:Record<Gap,RegExp>={base_layer:/\b(shirts?|tops?|polo|blouse|sweater|tee|t-shirt)\b/i,bottom:/\b(trousers?|pants|chinos?|jeans|shorts)\b/i,one_piece:/\b(dress|dresses|jumpsuit)\b/i,footwear:/\b(shoes?|sneakers?|loafers?|boots?|trainers?)\b/i,outerwear:/\b(jackets?|coats?|blazers?|overshirts?|bomber)\b/i}
export function adultLead(title:string,url:string,collection:Collection,role:Gap|null):boolean {
 const evidence=title+' '+url.replace(/[-_/]/g,' ')
 if(child.test(evidence))return false
 if(collection==='masculine'?female.test(evidence):male.test(evidence))return false
 return !role||rolePatterns[role].test(evidence)
}
const colors=/\b(black|white|cream|beige|brown|navy|blue|grey|gray|green|red|olive|tan|khaki|pink)\b/i
const subtype=/\b(bomber|blazer|denim|chinos?|jeans|loafers?|sneakers?|polo|t-shirt|shirt|jacket|coat|trousers|pants|boots)\b/i
const material=/\b(cotton|linen|leather|wool|denim|polyester|suede|fleece|knit)\b/i
const canonical=(v:string)=>v.toLowerCase().replace('gray','grey').replace(/s$/,'')
const match=(s:string,r:RegExp)=>canonical(s.match(r)?.[0]??'')
export function attributeOverlap(item:WardrobeItem,title:string,role:Gap):number {
 if(item.layer_role!==role)return 0
 const source=[item.display_name,item.subcategory??''].join(' ')
 const color=match(source,colors), targetColor=match(title,colors)
 const type=match(source,subtype),targetType=match(title,subtype)
 const fabric=match(source,material),targetFabric=match(title,material)
 if(!color||color!==targetColor)return 0
 if(type&&type===targetType)return .9
 if(fabric&&fabric===targetFabric)return .8
 return .45
}
export function suitableOutfit(items:WardrobeItem[]):boolean {
 const lounge=items.some(i=>/\b(lounge|pajamas?|pyjamas?|sleepwear|nightwear|fluffy lounge)\b/i.test(i.display_name))
 if(!lounge)return true
 return !items.some(i=>/\b(loafers?|oxford shoes|derby shoes|blazers?|bomber|suit)\b/i.test(i.display_name))
}
