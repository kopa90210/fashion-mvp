import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCalibrationState } from '@/src/app/actions/outfit'
import { getFashionDnaSummary } from '@/src/app/actions/fashion-dna'
import { buttonVariants } from '@/components/ui/button'
import OutfitCalibrationScreen from './OutfitCalibrationScreen'
import OnboardingCompletionScreen from './OnboardingCompletionScreen'
import { getPendingOwnedSelection } from '@/src/app/actions/wardrobe'

export default async function OutfitCalibrationPage() {
  const state = await getCalibrationState()

  if (state.completed) {
    redirect('/outfits')
  }

  if (state.answeredCount >= state.target) {
    const pending = await getPendingOwnedSelection()
    if (!pending.exists) redirect('/quiz?done=true')
    return <OnboardingCompletionScreen count={pending.itemIds.length} version={pending.version} />
  }

  if (!state.outfit) {
    return (
      <main className="px-4 py-10 text-[#1d1b18] sm:px-6">
        <div className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
            Style check
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight">
            We need a few more example pieces.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6d6257]">
            We could not build a style check look from the available examples. Your ownership selections are safe; choose more only if they match clothes you own.
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
