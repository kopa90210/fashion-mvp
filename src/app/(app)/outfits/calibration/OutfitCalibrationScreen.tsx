'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Heart, ThumbsDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  submitCalibrationFeedback,
  skipOutfitCalibration,
  type CalibrationOutfit,
} from '@/src/app/actions/outfit'
import { getChangedTags, getOptimisticVector } from '@/src/lib/outfit/feedback-helpers'
import { vectorToSignals } from '@/src/lib/fashion-dna/labels'
import type { DnaSignal } from '@/src/lib/fashion-dna/types'
import WhyThisExplainer from '@/src/components/outfit/WhyThisExplainer'
import FashionDnaPanel from '@/src/components/fashion-dna/FashionDnaPanel'
import FlatLay from '@/src/components/outfit/FlatLay'

export default function OutfitCalibrationScreen({
  outfits,
  feedbackCount,
}: {
  outfits: CalibrationOutfit[]
  initialSignals: DnaSignal[]
  feedbackCount: number
}) {
  const router = useRouter()
  const [outfitIndex, setOutfitIndex] = useState(0)
  const [visible, setVisible] = useState(true)
  const [lastFeedback, setLastFeedback] = useState<boolean | null>(null)
  const [currentOutfit, setCurrentOutfit] = useState(outfits[0])
  const [vector, setVector] = useState(outfits[0].vector)
  const [isFinishing, setIsFinishing] = useState(false)
  const [isSkipping, setIsSkipping] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [swipeCount, setSwipeCount] = useState(feedbackCount)
  const [, startTransition] = useTransition()
  const feedbackQueue = useRef<Promise<unknown>>(Promise.resolve())

  const outfit = currentOutfit
  const totalOutfits = outfits.length
  const progressLabel = `${Math.min(outfitIndex + 1, totalOutfits)} of ${totalOutfits}`

  // Derive signals from the (potentially optimistically updated) vector
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
    const priorVector = vector

    const activeOutfit = outfit
    const isFinalOutfit = outfitIndex >= totalOutfits - 1
    const changedTags = getChangedTags(activeOutfit)
    const idempotencyKey = `outfit-feedback:${activeOutfit.id}`

    setLastFeedback(liked)
    setErrorMessage(null)
    setVisible(false)
    setVector((current) => getOptimisticVector(current, changedTags, liked))
    setSwipeCount((c) => c + 1)

    const feedbackPromise = feedbackQueue.current.then(() =>
      submitCalibrationFeedback(
        activeOutfit.id,
        liked,
        isFinalOutfit,
        idempotencyKey,
      ),
    )

    feedbackQueue.current = feedbackPromise.catch(() => undefined)

    window.setTimeout(() => {
      if (!isFinalOutfit) {
        startTransition(async () => {
          try {
            const result = await feedbackPromise
            const nextIndex = outfitIndex + 1
            const nextOutfit = result.nextOutfit ?? outfits[nextIndex]

            if (nextOutfit) {
              setCurrentOutfit(nextOutfit)
              setOutfitIndex(nextIndex)
            } else {
              setIsFinishing(true)
              setVisible(false)
            }

            setVector(result.vector)
          } catch (error) {
            setVector(priorVector)
            setSwipeCount((c) => c - 1)
            setErrorMessage(error instanceof Error ? error.message : 'Calibration could not be saved. Try again.')
          } finally {
            setLastFeedback(null)
            setVisible(true)
          }
        })
        return
      }

      setIsFinishing(true)
      startTransition(async () => {
        try {
          const result = await feedbackPromise
          setVector(result.vector)
          router.replace('/outfits')
          router.refresh()
        } catch (error) {
          setIsFinishing(false)
          setVisible(true)
          setVector(priorVector)
          setSwipeCount((c) => c - 1)
          setErrorMessage(
            error instanceof Error
              ? error.message
              : 'Calibration could not be saved. Try that last response again.',
          )
        }
      })
    }, 300)
  }

  return (
    <main className="min-h-screen bg-[#f7f4ef] px-4 py-6 text-[#1d1b18] sm:px-6 lg:py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
                Outfit calibration
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                Tune your first looks
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
                <Card className="rounded-lg border-[#d8cec2] bg-white/70 shadow-sm">
                  <CardHeader className="gap-2">
                    <CardTitle className="text-xl">Would you wear this?</CardTitle>
                    <CardDescription>
                      React to the generated outfits before your first daily recommendation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <FlatLay items={outfit.items} />

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4dbd0] pt-4">
                      <WhyThisExplainer reasons={outfit.reasons} />

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label="Dislike this calibration outfit"
                          onClick={() => handleFeedback(false)}
                        >
                          <ThumbsDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-lg"
                          aria-label="Like this calibration outfit"
                          onClick={() => handleFeedback(true)}
                        >
                          <Heart className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
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
                    Calibrating
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Preparing your first daily outfit.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#6d6257]">
                    Your three reactions are being folded into Fashion DNA now.
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
