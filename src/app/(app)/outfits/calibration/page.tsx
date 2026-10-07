import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCalibrationState } from '@/src/app/actions/outfit'
import { getFashionDnaSummary } from '@/src/app/actions/fashion-dna'
import { buttonVariants } from '@/components/ui/button'
import OutfitCalibrationScreen from './OutfitCalibrationScreen'

export default async function OutfitCalibrationPage() {
  const state = await getCalibrationState()

  if (state.completed) {
    redirect('/outfits')
  }

  if (!state.outfit) {
    return (
      <main className="min-h-screen bg-[#f7f4ef] px-4 py-10 text-[#1d1b18] sm:px-6">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
            Outfit calibration
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Choose a few more style pieces.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6d6257]">
            We need enough selected tops and bottoms, or one-piece looks, plus footwear to build your calibration outfits.
          </p>
          <Link href="/quiz?done=true" className={buttonVariants({ className: 'mt-6' })}>
            Choose style pieces
          </Link>
        </div>
      </main>
    )
  }

  const { feedbackCount } = await getFashionDnaSummary()

  return (
    <OutfitCalibrationScreen
      outfit={state.outfit}
      answeredCount={state.answeredCount}
      feedbackCount={feedbackCount}
    />
  )
}
