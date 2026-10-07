'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, ThumbsDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [swipeCount, setSwipeCount] = useState(feedbackCount)
  const [, startTransition] = useTransition()

  const outfit = currentOutfit
  const progressLabel = `Look ${Math.min(answeredCount + 1, 3)} of 3`

  const signals = useMemo(() => vectorToSignals(vector), [vector])

  function handleSkip() {
    if (isSkipping || isFinishing) return
    setIsSkipping(true)
    startTransition(async () => {
      try {
        await skipOutfitCalibration()
        router.replace('/outfits')
        router.refresh()
      } catch (error) {
        setIsSkipping(false)
        setErrorMessage(
          error instanceof Error ? error.message : 'Could not skip calibration.',
        )
      }
    })
  }

  function handleFeedback(liked: boolean) {
    if (!visible || isFinishing) return

    const activeOutfit = outfit
    const priorVector = vector
    const changedTags = getChangedTags(activeOutfit)
    const idempotencyKey = `outfit-feedback:${activeOutfit.id}`

    setLastFeedback(liked)
    setErrorMessage(null)
    setVisible(false)
    setVector((current) => getOptimisticVector(current, changedTags, liked))
    setSwipeCount((count) => count + 1)

    startTransition(async () => {
      try {
        const result = await submitCalibrationFeedback(
          activeOutfit.id,
          liked,
          idempotencyKey,
        )

        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 300)
        })

        setVector(result.vector)
        setAnsweredCount(result.answeredCount)

        if (result.completed) {
          setIsFinishing(true)
          router.replace('/outfits')
          router.refresh()
          return
        }

        if (!result.nextOutfit) {
          setErrorMessage(
            'We could not build the next style-check look from your current choices.',
          )
          setLastFeedback(null)
          setVisible(true)
          return
        }

        setCurrentOutfit(result.nextOutfit)
        setLastFeedback(null)
        setVisible(true)
      } catch (error) {
        setVector(priorVector)
        setSwipeCount((count) => count - 1)
        setLastFeedback(null)
        setVisible(true)
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Calibration could not be saved. Try again.',
        )
      }
    })
  }

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-4 py-6 text-[#1d1b18] sm:px-6 lg:py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
                Style check
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                What feels like you?
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSkip}
                disabled={isSkipping || isFinishing}
                className="text-xs text-[#7a6f62] underline-offset-4 hover:text-[#1d1b18] hover:underline transition-colors disabled:opacity-50"
              >
                Skip for now
              </button>
              <Badge variant="outline" className="border-[#b9aa99] bg-white/45 text-[#4f463d]">
                {progressLabel}
              </Badge>
            </div>
          </div>

          <AnimatePresence mode="wait">
            {visible && !isFinishing ? (
              <motion.div
                key={outfit.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: lastFeedback ? 52 : -52, scale: 0.98 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <OutfitCanvas
                  items={outfit.items}
                  identity="Would you wear this?"
                  description="Three quick looks. Your answer teaches StyleGraph what to recommend next."
                  reasons={outfit.reasons}
                  variant="framed"
                >
                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      aria-label="Not my style"
                      onClick={() => handleFeedback(false)}
                      className="h-12 rounded-full border-[#d8cec2] bg-[#fffdfa]"
                    >
                      <ThumbsDown aria-hidden="true" className="size-4" />
                      Not my style
                    </Button>
                    <Button
                      type="button"
                      aria-label="Love this"
                      onClick={() => handleFeedback(true)}
                      className="h-12 rounded-full bg-[#1d1b18] text-[#fffdfa]"
                    >
                      <Heart aria-hidden="true" className="size-4" />
                      Love this
                    </Button>
                  </div>
                </OutfitCanvas>
              </motion.div>
            ) : (
              <motion.div
                key="finishing"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex min-h-[520px] items-center justify-center rounded-lg border border-[#d8cec2] bg-white/65 p-8 text-center shadow-sm"
              >
                <div className="max-w-md">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
                    Style check complete
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Your taste profile is ready.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#6d6257]">
                    Your reactions are saved. Preparing Today from what StyleGraph has learned.
                  </p>
                  {errorMessage && (
                    <p className="mt-5 text-sm font-medium text-red-700">{errorMessage}</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="lg:pt-[88px]">
          <FashionDnaPanel signals={signals} feedbackCount={swipeCount} />
        </aside>
      </div>
    </main>
  )
}
