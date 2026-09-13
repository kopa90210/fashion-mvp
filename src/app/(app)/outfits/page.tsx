import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDailyOutfit, shouldShowOutfitCalibration } from '@/src/app/actions/outfit'
import { getFashionDnaSummary } from '@/src/app/actions/fashion-dna'
import DailyOutfitScreen from './DailyOutfitScreen'
import { buttonVariants } from '@/components/ui/button'

export default async function OutfitsPage() {
  if (await shouldShowOutfitCalibration()) {
    redirect('/outfits/calibration')
  }

  const [outfit, dnaSummary] = await Promise.all([
    getDailyOutfit(),
    getFashionDnaSummary(),
  ])

  if (!outfit) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-4 py-10 text-[#1d1b18] sm:px-6">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
            Daily outfit
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Add a few more wardrobe pieces.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6d6257]">
            I need at least a top, bottom, and footwear before I can build a useful look.
          </p>
          <Link href="/quiz?done=true" className={buttonVariants({ className: 'mt-6' })}>
            Choose wardrobe pieces
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
    />
  )
}
