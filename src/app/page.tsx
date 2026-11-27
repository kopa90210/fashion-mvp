import { redirect } from 'next/navigation'
import {createClient} from '@/src/lib/supabase/server'
import {onboardingDestination} from '@/src/lib/auth/onboarding'

export default async function Home(){
 const supabase=await createClient()
 const {data,error}=await supabase.auth.getUser()
 if(error||!data.user)redirect('/login')
 redirect(await onboardingDestination(supabase,data.user.id))
}
