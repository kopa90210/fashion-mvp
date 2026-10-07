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
            Style check
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            Choose a few more pieces you'd wear.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6d6257]">
            We need enough style references to build a valid look. These picks guide your taste profile; they are not added to your wardrobe.
          </p>
          <Link href="/quiz?done=true" className={buttonVariants({ className: 'mt-6' })}>
            Choose more style pieces
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
