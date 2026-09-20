'use client'

import { useMemo, useState, useTransition } from 'react'
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
import type { DailyOutfit } from '@/src/app/actions/outfit'
import { submitOutfitFeedback, getDailyOutfit } from '@/src/app/actions/outfit'
import { getChangedTags, getOptimisticVector } from '@/src/lib/outfit/feedback-helpers'
import { vectorToSignals } from '@/src/lib/fashion-dna/labels'
import type { DnaSignal } from '@/src/lib/fashion-dna/types'
import WhyThisExplainer from '@/src/components/outfit/WhyThisExplainer'
import FashionDnaPanel from '@/src/components/fashion-dna/FashionDnaPanel'
import FlatLay from '@/src/components/outfit/FlatLay'

export default function DailyOutfitScreen({
  outfit,
  feedbackCount,
}: {
  outfit: DailyOutfit
  initialSignals: DnaSignal[]
  feedbackCount: number
}) {
  const [currentOutfit, setCurrentOutfit] = useState(outfit)
  const [viewState, setViewState] = useState<'outfit' | 'loading' | 'done'>('outfit')
  const [selectedFeedback, setSelectedFeedback] = useState<boolean | null>(null)
  const [vector, setVector] = useState(outfit.vector)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [swipeCount, setSwipeCount] = useState(feedbackCount)
  const [, startTransition] = useTransition()

  const changedTags = useMemo(() => getChangedTags(currentOutfit), [currentOutfit])

  // Derive signals from the (potentially optimistically updated) vector
  const signals = useMemo(() => vectorToSignals(vector), [vector])

  function handleFeedback(liked: boolean) {
    if (selectedFeedback !== null) return
    const priorVector = vector
    const idempotencyKey = `outfit-feedback:${currentOutfit.id}`

    setSelectedFeedback(liked)
    setErrorMessage(null)
    setVector((current) => getOptimisticVector(current, changedTags, liked))
    setSwipeCount((c) => c + 1)

    if (liked) {
      setViewState('done')
      setPendingMessage('Updating your style DNA...')
    } else {
      setViewState('loading')
    }

    startTransition(async () => {
      try {
        const result = await submitOutfitFeedback(currentOutfit.id, liked, idempotencyKey)
        setVector(result.vector)
        
        if (liked) {
          setPendingMessage('Style DNA updated.')
        } else {
          const nextOutfit = await getDailyOutfit()
          if (nextOutfit) {
            setCurrentOutfit(nextOutfit)
            setSelectedFeedback(null)
            setViewState('outfit')
          } else {
            setViewState('done')
            setPendingMessage('No more outfits available today.')
          }
        }
      } catch (error) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'Feedback saved locally, but the style update failed.',
        )
        setPendingMessage(null)
        setSwipeCount((c) => c - 1)
        setVector(priorVector)
        setSelectedFeedback(null)
        setViewState('outfit')
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
                Today&apos;s outfit
              </p>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
                Here is your recommendation
              </h1>
            </div>
            <Badge variant="outline" className="border-[#b9aa99] bg-white/45 text-[#4f463d]">
              1 per day
            </Badge>
          </div>

          <AnimatePresence mode="wait">
            {viewState === 'outfit' ? (
              <motion.div
                key={currentOutfit.id}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -18 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              >
                <Card className="rounded-lg border-[#d8cec2] bg-white/70 shadow-sm">
                  <CardHeader className="gap-2">
                    <CardTitle className="text-xl">Today&apos;s look</CardTitle>
                    <CardDescription>
                      Built from your wardrobe pieces. Rate it to refine your style DNA.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <FlatLay items={currentOutfit.items} />

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e4dbd0] pt-4">
                      <WhyThisExplainer reasons={currentOutfit.reasons} />

                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-lg"
                          aria-label="Dislike this outfit"
                          onClick={() => handleFeedback(false)}
                          disabled={selectedFeedback !== null}
                        >
                          <ThumbsDown className="size-4" />
                        </Button>
                        <Button
                          type="button"
                          size="icon-lg"
                          aria-label="Like this outfit"
                          onClick={() => handleFeedback(true)}
                          disabled={selectedFeedback !== null}
                        >
                          <Heart className="size-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ) : viewState === 'loading' ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                className="flex min-h-[520px] items-center justify-center rounded-lg border border-[#d8cec2] bg-white/65 shadow-sm"
              >
                <div className="flex flex-col items-center gap-3 text-[#7a6f62]">
                  <div className="size-6 animate-spin rounded-full border-2 border-[#d8cec2] border-t-[#7a6f62]" />
                  <p className="text-sm font-medium">Finding another outfit...</p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="tomorrow"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.28, ease: 'easeOut' }}
                className="flex min-h-[520px] items-center justify-center rounded-lg border border-[#d8cec2] bg-white/65 p-8 text-center shadow-sm"
              >
                <div className="max-w-md">
                  <p className="text-sm font-medium uppercase tracking-[0.18em] text-[#7a6f62]">
                    Thanks
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                    Tomorrow&apos;s outfit will use what you just told me.
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-[#6d6257]">
                    Come back tomorrow for one fresh look, tuned a little more to your taste.
                  </p>
                  {pendingMessage && (
                    <p className="mt-5 text-sm font-medium text-[#4f463d]">{pendingMessage}</p>
                  )}
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
