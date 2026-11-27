import 'server-only'
import {createClient} from '@/src/lib/supabase/server'
import {parseShoppingPreferences,preferencesEnabled,type ShoppingPreferences} from './shopping-preferences'
export async function loadShoppingPreferences():Promise<ShoppingPreferences|null>{
 if(!preferencesEnabled())return null
 const db=await createClient()
 const {data:{user}}=await db.auth.getUser()
 if(!user)return null
 const {data,error}=await db.from('stylist_shopping_preferences').select('collection,budget,top_size,bottom_size,shoe_size').eq('user_id',user.id).maybeSingle()
 if(error)throw new Error('Shopping preferences unavailable')
 return data?parseShoppingPreferences({collection:data.collection,budget:data.budget,sizes:{top:data.top_size,bottom:data.bottom_size,shoe:data.shoe_size}}):null
}
export async function saveShoppingPreferences(db:Awaited<ReturnType<typeof createClient>>,userId:string,p:ShoppingPreferences):Promise<boolean>{
 if(!preferencesEnabled())return false
 const {error}=await db.from('stylist_shopping_preferences').upsert({user_id:userId,collection:p.collection,budget:p.budget,top_size:p.sizes.top,bottom_size:p.sizes.bottom,shoe_size:p.sizes.shoe,updated_at:new Date().toISOString()},{onConflict:'user_id'})
 return !error
}
