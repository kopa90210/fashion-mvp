'use client'

import { useRef, useState, useTransition } from 'react'
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
import OutfitCanvas from '@/src/components/outfit/OutfitCanvas'

export default function OutfitCalibrationScreen({
  outfit: initialOutfit,
  answeredCount: initialAnsweredCount,
  target = 3,
  feedbackCount,
}: {
  outfit: CalibrationOutfit
  answeredCount: number
  target?: number
  feedbackCount: number
}) {
  const router = useRouter()
  const [visible, setVisible] = useState(true)
  const [lastFeedback, setLastFeedback] = useState<boolean | null>(null)
  const [currentOutfit, setCurrentOutfit] = useState(initialOutfit)
  const [answeredCount, setAnsweredCount] = useState(initialAnsweredCount)
  const [, setVector] = useState(initialOutfit.vector)
  const [isFinishing, setIsFinishing] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [, setSwipeCount] = useState(feedbackCount)
  const submissionLock = useRef(false)
  const [, startTransition] = useTransition()
  const prefersReducedMotion = useReducedMotion()

  const outfit = currentOutfit
  const currentLookNumber = Math.min(answeredCount + 1, target)
  const progressLabel = `Look ${currentLookNumber} of ${target}`

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
    const priorVector = initialOutfit.vector
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

        if (result.completed) {
          setIsFinishing(true)
          setVisible(false)
          router.replace('/outfits/calibration')
          router.refresh()
          return
        }

        setVector(result.vector)
        setAnsweredCount(result.answeredCount)

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
    <main className="min-h-[100dvh] bg-[#FBF8F4] px-4 py-6 pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-[#1D1B18] sm:px-6 lg:py-10">
      <div className="mx-auto max-w-lg">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4 sm:mb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1D1B18] sm:text-3xl">
              Let’s tune your style.
            </h1>
            <p className="mt-1 text-base font-medium text-[#1D1B18] sm:text-lg">
              Would you wear this?
            </p>
            <p className="mt-0.5 text-xs text-[#6D6257] sm:text-sm">
              This helps us learn your taste.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleSkip}
              disabled={isSkipping || isSubmitting || isFinishing}
              className="rounded-sm text-xs font-medium text-[#7A6F62] underline-offset-4 transition-colors hover:text-[#1D1B18] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] disabled:opacity-50"
            >
              Back to pieces
            </button>
            <span
              role="progressbar"
              aria-label="Style check progress"
              aria-valuemin={1}
              aria-valuemax={target}
              aria-valuenow={currentLookNumber}
              className="rounded-full border border-[#D8CEC2] bg-[#FFFDFA] px-3.5 py-1 text-xs font-medium text-[#4F463D] shadow-xs"
            >
              {progressLabel}
            </span>
          </div>
        </header>

        <AnimatePresence mode="wait">
          {visible && !isFinishing ? (
            <motion.div
              key={outfit.id}
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, x: lastFeedback ? 36 : -36, scale: 0.99 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.24, ease: 'easeOut' }}
              aria-busy={isSubmitting}
              className="mx-auto w-full"
            >
              <OutfitCanvas
                items={outfit.items}
                calibration={true}
                variant="editorial"
                className="w-full"
              >
                <section
                  aria-label="Style preference feedback"
                  className="mt-4 sm:mt-5"
                >
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Not for me"
                      aria-pressed={isSubmitting && lastFeedback === false}
                      onClick={() => handleFeedback(false)}
                      disabled={isSubmitting || isFinishing}
                      className="h-13 rounded-full border border-[#D8CEC2] bg-[#FFFDFA] px-4 text-sm font-semibold text-[#1D1B18] shadow-xs transition-colors hover:bg-[#F7F4EF] hover:border-[#B9AA99] focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2 disabled:opacity-60 sm:h-14 sm:text-base"
                    >
                      <ThumbsDown aria-hidden="true" className="size-4 shrink-0" />
                      <span>Not for me</span>
                    </Button>
                    <Button
                      type="button"
                      aria-label="I’d wear this"
                      aria-pressed={isSubmitting && lastFeedback === true}
                      onClick={() => handleFeedback(true)}
                      disabled={isSubmitting || isFinishing}
                      className="h-13 rounded-full bg-[#1D1B18] px-4 text-sm font-semibold text-[#FFFDFA] shadow-xs transition-colors hover:bg-[#2C2925] focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2 disabled:opacity-60 sm:h-14 sm:text-base"
                    >
                      <Heart aria-hidden="true" className="size-4 shrink-0 fill-current text-[#FFFDFA]" />
                      <span>I’d wear this</span>
                    </Button>
                  </div>
                  <p aria-live="polite" className="min-h-5 pt-2 text-center text-xs text-[#6D6257]">
                    {isSubmitting ? 'Saving your choice…' : ''}
                  </p>
                </section>
                {errorMessage ? (
                  <p role="alert" className="mt-3 rounded-2xl border border-[#C9A8A3] bg-[#FFFDFA] px-4 py-3 text-sm text-[#8A352E]">
                    {errorMessage}
                  </p>
                ) : null}
              </OutfitCanvas>
            </motion.div>
          ) : isFinishing ? (
            <motion.div
              key="finishing"
              initial={prefersReducedMotion ? undefined : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.28, ease: 'easeOut' }}
              className="flex min-h-[24rem] items-center justify-center rounded-[2rem] border border-[#D8CEC2] bg-[#FFFDFA]/65 p-8 text-center"
            >
              <div className="max-w-md">
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7A6F62]">
                  Style check complete
                </p>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#1D1B18]">
                  Your taste profile is ready.
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#6D6257]">
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
              className="mx-auto h-[clamp(24rem,60vw,36rem)] w-full max-w-lg animate-pulse rounded-[2rem] bg-[#EBE3D8] motion-reduce:animate-none"
            >
              <span className="sr-only">Loading the next look…</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
