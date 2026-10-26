'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Heart, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  submitCalibrationFeedback,
  skipOutfitCalibration,
  type CalibrationOutfit,
} from '@/src/app/actions/outfit'
import { getChangedTags, getOptimisticVector } from '@/src/lib/outfit/feedback-helpers'
import { vectorToSignals } from '@/src/lib/fashion-dna/labels'
import FashionDnaPanel from '@/src/components/fashion-dna/FashionDnaPanel'
import OutfitCanvas from '@/src/components/outfit/OutfitCanvas'

export default function OutfitCalibrationScreen({
  outfit: initialOutfit,
  answeredCount: initialAnsweredCount,
  feedbackCount,
}: {
  outfit: CalibrationOutfit
  answeredCount: number
  feedbackCount: number
}) {
  const router = useRouter()
  const [visible, setVisible] = useState(true)
  const [lastFeedback, setLastFeedback] = useState<boolean | null>(null)
  const [currentOutfit, setCurrentOutfit] = useState(initialOutfit)
  const [answeredCount, setAnsweredCount] = useState(initialAnsweredCount)
  const [vector, setVector] = useState(initialOutfit.vector)
  const [isFinishing, setIsFinishing] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [swipeCount, setSwipeCount] = useState(feedbackCount)
  const submissionLock = useRef(false)
  const [, startTransition] = useTransition()
  const prefersReducedMotion = useReducedMotion()

  const outfit = currentOutfit
  const progressLabel = `Look ${Math.min(answeredCount + 1, 3)} of 3`

  const signals = useMemo(() => vectorToSignals(vector), [vector])

  function handleSkip() {
    if (isSkipping || isSubmitting || isFinishing) return
    setIsSkipping(true)
    startTransition(async () => {
      try {
        await skipOutfitCalibration()
        router.replace('/quiz?done=true')
        router.refresh()
      } catch {
        setIsSkipping(false)
        setErrorMessage('We could not skip the style check. Please try again.')
      }
    })
  }

  function handleFeedback(liked: boolean) {
    if (!visible || isSubmitting || isFinishing || submissionLock.current) return

    const activeOutfit = outfit
    const priorVector = vector
    const changedTags = getChangedTags(activeOutfit)
    const idempotencyKey = `outfit-feedback:${activeOutfit.id}`

    submissionLock.current = true
    setIsSubmitting(true)
    setLastFeedback(liked)
    setErrorMessage(null)
    setVector((current) => getOptimisticVector(current, changedTags, liked))
    setSwipeCount((count) => count + 1)

    startTransition(async () => {
      try {
        const result = await submitCalibrationFeedback(
          activeOutfit.id,
          liked,
          idempotencyKey,
        )

        setVector(result.vector)
        setAnsweredCount(result.answeredCount)

        if (result.completed) {
          setIsFinishing(true)
          setVisible(false)
          router.replace('/outfits/calibration')
          router.refresh()
          return
        }

        if (!result.nextOutfit) {
          setErrorMessage(
            'Your choice was saved, but we could not load the next look. Please try again.',
          )
          setLastFeedback(null)
          setIsSubmitting(false)
          submissionLock.current = false
          return
        }

        setVisible(false)
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, prefersReducedMotion ? 0 : 180)
        })
        setCurrentOutfit(result.nextOutfit)
        setLastFeedback(null)
        setVisible(true)
        setIsSubmitting(false)
        submissionLock.current = false
      } catch {
        setVector(priorVector)
        setSwipeCount((count) => count - 1)
        setLastFeedback(null)
        setVisible(true)
        setIsSubmitting(false)
        submissionLock.current = false
        setErrorMessage('We could not save that choice. Please try again.')
      }
    })
  }

  return (
    <main className="px-4 py-6 text-[#1d1b18] sm:px-6 lg:py-10">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(17rem,3fr)] lg:gap-10">
        <section className="min-w-0">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-4 sm:mb-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
                Style check
              </p>
              <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">
                What feels like you?
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[#6d6257] sm:text-base">
                Three quick looks help us understand your taste.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSkipping || isSubmitting || isFinishing}
                className="rounded-sm text-xs text-[#7a6f62] underline-offset-4 transition-colors hover:text-[#1d1b18] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d1b18] focus-visible:ring-offset-4 disabled:opacity-50"
              >
                Back to pieces
              </button>
              <span
                role="progressbar"
                aria-label="Style check progress"
                aria-valuemin={1}
                aria-valuemax={3}
                aria-valuenow={Math.min(answeredCount + 1, 3)}
                className="rounded-full border border-[#b9aa99] bg-[#fffdfa]/60 px-3 py-1.5 text-xs font-medium text-[#4f463d]"
              >
                {progressLabel}
              </span>
            </div>
          </header>

          <AnimatePresence mode="wait">
            {visible && !isFinishing ? (
              <motion.div
                key={outfit.id}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: lastFeedback ? 36 : -36, scale: 0.99 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: 'easeOut' }}
                aria-busy={isSubmitting}
              >
                <OutfitCanvas
                  items={outfit.items}
                  reasons={outfit.reasons}
                  variant="editorial"
                >
                  <section
                    aria-label="Style preference feedback"
                    className="sticky bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 -mx-1 mt-5 rounded-2xl border border-[#d8cec2] bg-[#f7f4ef]/95 p-2 shadow-[0_8px_24px_rgba(62,51,40,0.10)] backdrop-blur-sm lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
                  >
                    <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Not my style"
                      aria-pressed={isSubmitting && lastFeedback === false}
                      onClick={() => handleFeedback(false)}
                      disabled={isSubmitting || isFinishing}
                      className="h-14 rounded-full border-[#b9aa99] bg-[#fffdfa] px-3 text-sm focus-visible:ring-2 focus-visible:ring-[#1d1b18] focus-visible:ring-offset-2 disabled:opacity-60 sm:text-base"
                    >
                      <ThumbsDown aria-hidden="true" className="size-4" />
                      Not my style
                    </Button>
                    <Button
                      type="button"
                      aria-label="Love this"
                      aria-pressed={isSubmitting && lastFeedback === true}
                      onClick={() => handleFeedback(true)}
                      disabled={isSubmitting || isFinishing}
                      className="h-14 rounded-full bg-[#1d1b18] px-3 text-sm text-[#fffdfa] focus-visible:ring-2 focus-visible:ring-[#1d1b18] focus-visible:ring-offset-2 disabled:opacity-60 sm:text-base"
                    >
                      <Heart aria-hidden="true" className="size-4" />
                      Love this
                    </Button>
                    </div>
                    <p aria-live="polite" className="min-h-5 pt-2 text-center text-xs text-[#6d6257]">
                      {isSubmitting ? 'Saving your choice…' : ''}
                    </p>
                  </section>
                  {errorMessage ? (
                    <p role="alert" className="mt-3 rounded-2xl border border-[#c9a8a3] bg-[#fffdfa] px-4 py-3 text-sm text-[#8a352e]">
                      {errorMessage}
                    </p>
                  ) : null}
                </OutfitCanvas>
              </motion.div>
            ) : isFinishing ? (
              <motion.div
                key="finishing"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: 'easeOut' }}
                className="flex min-h-[32rem] items-center justify-center rounded-[2rem] border border-[#d8cec2] bg-[#fffdfa]/65 p-8 text-center"
              >
                <div className="max-w-md">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
                    Style check complete
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Your taste profile is ready.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#6d6257]">
                    Your reactions are saved. Review your selected pieces to finish.
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="transitioning"
                role="status"
                aria-label="Loading the next look"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-[clamp(28rem,68vw,42rem)] animate-pulse rounded-[2rem] bg-[#ebe3d8] motion-reduce:animate-none"
              >
                <span className="sr-only">Loading the next look…</span>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside aria-label="Style learning summary" className="self-start lg:sticky lg:top-8 lg:pt-28">
          <FashionDnaPanel signals={signals} feedbackCount={swipeCount} />
        </aside>
      </div>
    </main>
  )
}
