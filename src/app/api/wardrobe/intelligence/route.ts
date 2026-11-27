import { createClient } from '@/src/lib/supabase/server'
import { loadStylistWardrobe } from '@/src/lib/stylist/wardrobe'
import { reserveStylistQuota } from '@/src/lib/stylist/quota'
import { targets,type Target } from '@/src/lib/stylist/wardrobe-intelligence'
import { meteredWardrobe } from '@/src/lib/stylist/metered-wardrobe'
const respond=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}})
export async function POST(request:Request){
 try{
  if(process.env.ENABLE_WARDROBE_INTELLIGENCE!=='true'&&process.env.ENABLE_STYLE_TRANSFORMATION!=='true')return respond({error:'Not enabled'},404)
  const url=new URL(request.url),origin=request.headers.get('origin'),host=request.headers.get('host')??url.host
  if(request.headers.get('sec-fetch-site')==='cross-site'||(origin&&origin!==url.protocol+'//'+host))return respond({error:'Origin denied'},403)
  if(request.headers.get('content-type')?.split(';')[0]!=='application/json'||!request.body)return respond({error:'Invalid request'},400)
  const reader=request.body.getReader()
  let size=0,text=''
  const decoder=new TextDecoder()
  try{
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1024){await reader.cancel();return respond({error:'Request too large'},400)}text+=decoder.decode(value,{stream:true})}
   text+=decoder.decode()
  }finally{reader.releaseLock()}
  let raw:unknown
  try{raw=JSON.parse(text)}catch{return respond({error:'Invalid request'},400)}
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return respond({error:'Invalid request'},400)
  const target=(raw as Record<string,unknown>).target
  if(target!==null&&!targets.includes(target as Target))return respond({error:'Invalid target'},400)
  if((target===null?process.env.ENABLE_WARDROBE_INTELLIGENCE:process.env.ENABLE_STYLE_TRANSFORMATION)!=='true')return respond({error:'Not enabled'},404)
  const requestId=request.headers.get('Idempotency-Key')
  if(!requestId||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)))return respond({error:'Invalid request ID'},400)
  const supabase=await createClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)return respond({error:'Sign in first'},401)
  if(!await reserveStylistQuota(user.id,'api_hourly'))return respond({error:'Hourly limit reached'},429)
  const context=await loadStylistWardrobe(supabase,user.id)
  const result=await meteredWardrobe(user.id,requestId,context,target as Target|null)
  return result?respond(result):respond({error:'Decision unavailable or still processing. Try again.'},409)
 }catch{return respond({error:'Wardrobe analysis unavailable. Try again.'},503)}
}
