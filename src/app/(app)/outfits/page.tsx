import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDailyOutfit, shouldShowOutfitCalibration } from '@/src/app/actions/outfit'
import { getFashionDnaSummary } from '@/src/app/actions/fashion-dna'
import { getUserWardrobeItems } from '@/src/app/actions/wardrobe'
import DailyOutfitScreen from './DailyOutfitScreen'
import { buttonVariants } from '@/components/ui/button'

export default async function OutfitsPage() {
  if (await shouldShowOutfitCalibration()) {
    redirect('/outfits/calibration')
  }

  const [outfit, dnaSummary, ownedItems] = await Promise.all([
    getDailyOutfit(),
    getFashionDnaSummary(),
    getUserWardrobeItems(),
  ])

  if (!outfit) {
    const hasOwnedPieces = ownedItems.length > 0

    return (
      <main className="min-h-screen bg-[#f7f4ef] px-4 py-10 text-[#1d1b18] sm:px-6">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
            Today
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            {hasOwnedPieces
              ? "You're close to your first Today look."
              : 'Your style is ready. Now add your clothes.'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6d6257]">
            {hasOwnedPieces
              ? 'Add enough real pieces for either a top + bottom + shoes, or a one-piece + shoes.'
              : "Upload one real outfit photo. We'll separate the pieces, and you choose what enters your wardrobe."}
          </p>
          <Link href="/wardrobe/add" className={buttonVariants({ className: 'mt-6 h-12 rounded-full' })}>
            {hasOwnedPieces ? 'Add another outfit' : 'Upload an outfit'}
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
