import type {createClient} from '@/src/lib/supabase/server'

/** Finalization commits wardrobe ownership and sets this existing account flag atomically.
 * Legacy calibrated accounts also qualify; never infer completion from wardrobe size.
 */
export async function onboardingDestination(supabase:Awaited<ReturnType<typeof createClient>>,userId:string):Promise<'/outfits'|'/quiz'>{
 const {data,error}=await supabase.from('users').select('has_completed_calibration').eq('id',userId).maybeSingle()
 if(error)throw new Error('Could not read onboarding status')
 return data?.has_completed_calibration===true?'/outfits':'/quiz'
}
