import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/server'
import { getDailyOutfit, shouldShowOutfitCalibration } from '@/src/app/actions/outfit'
import { getFashionDnaSummary } from '@/src/app/actions/fashion-dna'
import { getUserWardrobeItems } from '@/src/app/actions/wardrobe'
import DailyOutfitScreen from './DailyOutfitScreen'
import { buttonVariants } from '@/components/ui/button'

export default async function OutfitsPage() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) redirect('/login')

  if (await shouldShowOutfitCalibration()) {
    redirect('/outfits/calibration')
  }

  const [outfit, dnaSummary, ownedItems] = await Promise.all([
    getDailyOutfit(),
    getFashionDnaSummary(),
    getUserWardrobeItems(),
  ])

  if (!outfit) {
    return (
      <main className="px-4 py-10 text-[#1d1b18] sm:px-6">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
            Today
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">Your closet is taking shape</h1>
          <p className="mt-3 text-sm leading-6 text-[#6d6257]">
            Add a few more pieces to create your first outfit.
          </p>
          <Link href="/wardrobe/add" className={buttonVariants({ className: 'mt-6 h-12 rounded-full' })}>
            Add more clothes
          </Link>
        </div>
      </main>
    )
  }

  return (
    <DailyOutfitScreen
      outfit={outfit}
      initialSignals={dnaSummary.signals}
      feedbackCount={dnaSummary.feedbackCount}
      ownedItemIds={ownedItems.map((item) => item.id)}
    />
  )
}
