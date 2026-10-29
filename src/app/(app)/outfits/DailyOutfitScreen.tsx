'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bookmark, Check, Heart, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DailyOutfit } from '@/src/app/actions/outfit'
import { submitOutfitFeedback, getDailyOutfit } from '@/src/app/actions/outfit'
import { recordOutfitNotToday, recordOutfitWorn } from '@/src/app/actions/outfit-interactions'
import { saveOutfitLook, unsaveOutfitLook } from '@/src/app/actions/profile'
import { getChangedTags, getOptimisticVector } from '@/src/lib/outfit/feedback-helpers'
import { vectorToSignals } from '@/src/lib/fashion-dna/labels'
import type { DnaSignal } from '@/src/lib/fashion-dna/types'
import FashionDnaPanel from '@/src/components/fashion-dna/FashionDnaPanel'
import OutfitCanvas from '@/src/components/outfit/OutfitCanvas'
import SwapOutfitFlow from './SwapOutfitFlow'

export default function DailyOutfitScreen({
  outfit,
  feedbackCount,
  ownedItemIds = [],
}: {
  outfit: DailyOutfit
  initialSignals: DnaSignal[]
  feedbackCount: number
  ownedItemIds?: string[]
}) {
  const [currentOutfit, setCurrentOutfit] = useState(outfit)
  const [viewState, setViewState] = useState<'outfit' | 'loading' | 'done'>('outfit')
  const [selectedFeedback, setSelectedFeedback] = useState<boolean | null>(null)
  const [vector, setVector] = useState(outfit.vector)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [swipeCount, setSwipeCount] = useState(feedbackCount)
  const [swapOwnedIds, setSwapOwnedIds] = useState<string[]>([])
  const [pendingInteraction, setPendingInteraction] = useState<{ outfitId: string; event: 'worn' | 'not_today' } | null>(null)
  const [completedInteraction, setCompletedInteraction] = useState<{ outfitId: string; event: 'worn' | 'not_today' } | null>(null)
  const [interactionError, setInteractionError] = useState<{ outfitId: string; message: string } | null>(null)
  const [isSaved, setIsSaved] = useState(false)
  const [isSavePending, setIsSavePending] = useState(false)
  const interactionLock = useRef(false)
  const [, startTransition] = useTransition()

  const changedTags = useMemo(() => getChangedTags(currentOutfit), [currentOutfit])
  const owned = new Set([...ownedItemIds, ...swapOwnedIds])
  const personal = currentOutfit.items.length > 0 && currentOutfit.items.every((item) => owned.has(item.id))
  const identity = currentOutfit.items.filter((item) => ['base_layer', 'bottom', 'one_piece', 'footwear'].includes(item.layer_role)).map((item) => item.display_name.trim()).filter(Boolean).slice(0, 3).join(' · ')
  const currentInteraction = completedInteraction?.outfitId === currentOutfit.id ? completedInteraction.event : null
  const interactionIsPending = pendingInteraction?.outfitId === currentOutfit.id

  // Derive signals from the (potentially optimistically updated) vector
  const signals = useMemo(() => vectorToSignals(vector), [vector])

  function handleInteraction(event: 'worn' | 'not_today') {
    if (!personal || interactionLock.current || currentInteraction !== null) return

    const outfitId = currentOutfit.id
    const idempotencyKey = `today:${event}:${outfitId}`
    interactionLock.current = true
    setPendingInteraction({ outfitId, event })
    setInteractionError(null)

    startTransition(async () => {
      try {
        if (event === 'worn') await recordOutfitWorn(outfitId, idempotencyKey)
        else await recordOutfitNotToday(outfitId, idempotencyKey)
        setCompletedInteraction({ outfitId, event })
      } catch {
        setInteractionError({ outfitId, message: 'Could not save that decision. Please try again.' })
      } finally {
        interactionLock.current = false
        setPendingInteraction((current) => current?.outfitId === outfitId ? null : current)
      }
    })
  }

  function handleToggleSave() {
    if (isSavePending) return
    setIsSavePending(true)
    const nextSaved = !isSaved
    setIsSaved(nextSaved)

    startTransition(async () => {
      try {
        if (nextSaved) await saveOutfitLook(currentOutfit.id)
        else await unsaveOutfitLook(currentOutfit.id)
      } catch {
        setIsSaved(!nextSaved)
      } finally {
        setIsSavePending(false)
      }
    })
  }

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
      setPendingMessage('Saving your preferences…')
    } else {
      setViewState('loading')
    }

    startTransition(async () => {
      try {
        const result = await submitOutfitFeedback(currentOutfit.id, liked, idempotencyKey)
        setVector(result.vector)
        
        if (liked) {
          setPendingMessage('Your preferences are saved.')
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
      } catch {
        setErrorMessage('Could not save your preference. Please try again.')
        setPendingMessage(null)
        setSwipeCount((c) => c - 1)
        setVector(priorVector)
        setSelectedFeedback(null)
        setViewState('outfit')
      }
    })
  }

  return (
    <main className="px-5 py-7 text-[#1d1b18] sm:px-8 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-7">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Today</h1>
          <p className="mt-3 text-sm text-[#6d6257]">{personal ? 'From your wardrobe' : 'Style inspiration'}</p>
          {!personal && <p className="mt-2 max-w-xl text-sm leading-6 text-[#6d6257]">A look to explore your preferences. These pieces are not all part of your confirmed wardrobe.</p>}
        </header>
        <AnimatePresence mode="wait">
          {viewState === 'outfit' ? (
            <motion.section key={currentOutfit.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
              <div className="mx-auto max-w-xl">
                <OutfitCanvas
                  items={currentOutfit.items}
                  identity={identity || 'A look for you'}
                  reasons={currentOutfit.reasons}
                  variant="editorial"
                  reasonsDefaultOpen
                >
                {personal && (
                  <section aria-label="Today's outfit decision" className="mt-7">
                    <Button type="button" onClick={() => handleInteraction('worn')} disabled={interactionIsPending || currentInteraction !== null} className="h-13 w-full rounded-full bg-[#1d1b18] text-[#fffdfa]">
                      {currentInteraction === 'worn' && <Check aria-hidden="true" className="size-4" />}
                      {currentInteraction === 'worn' ? 'Locked in' : "I'm wearing this"}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => handleInteraction('not_today')} disabled={interactionIsPending || currentInteraction !== null} className="mt-2 h-11 w-full rounded-full text-[#6d6257]">Not today</Button>
                    <SwapOutfitFlow outfit={currentOutfit} onApplied={(derivedOutfit) => {
                      setCurrentOutfit(derivedOutfit)
                      setSwapOwnedIds((ids) => [...new Set([...ids, ...derivedOutfit.items.map((item) => item.id)])])
                    }} />
                    <div className="mt-3 flex justify-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleToggleSave}
                        disabled={isSavePending}
                        className="h-9 gap-1.5 rounded-full text-xs text-[#6d6257] hover:text-[#1d1b18]"
                      >
                        <Bookmark className={`size-3.5 ${isSaved ? 'fill-[#596c5e] text-[#596c5e]' : ''}`} />
                        {isSaved ? 'Saved to Lookbook' : 'Save this look'}
                      </Button>
                    </div>
                    {currentInteraction === 'not_today' && <p role="status" className="mt-3 text-center text-sm leading-6 text-[#6d6257]">Got it — we&apos;ll treat this as a today decision, not a style dislike.</p>}
                    {interactionError?.outfitId === currentOutfit.id && <p role="alert" className="mt-3 text-center text-sm text-red-700">{interactionError.message}</p>}
                  </section>
                )}
                </OutfitCanvas>
                <section aria-label="Style preference feedback" className="mt-7 border-t border-[#d8cec2] pt-5">
                  <p className="mb-4 text-sm text-[#6d6257]">Do you like this style?</p>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => handleFeedback(false)} disabled={selectedFeedback !== null} className="h-12 flex-1 rounded-full border-[#d8cec2] bg-[#fffdfa]"><ThumbsDown aria-hidden="true" className="size-4" />Not my style</Button>
                    <Button type="button" onClick={() => handleFeedback(true)} disabled={selectedFeedback !== null} className="h-12 flex-1 rounded-full bg-[#1d1b18] text-[#fffdfa]"><Heart aria-hidden="true" className="size-4" />Love this</Button>
                  </div>
                </section>
              </div>
            </motion.section>
          ) : viewState === 'loading' ? (
            <motion.section key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex min-h-[55vh] flex-col items-center justify-center gap-4 rounded-3xl bg-[#ebe3d8]" role="status">
              <div aria-hidden="true" className="size-6 animate-spin rounded-full border-2 border-[#d8cec2] border-t-[#6d6257]" />
              <p className="text-sm text-[#6d6257]">Finding another outfit…</p>
            </motion.section>
          ) : (
            <motion.section key="done" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl bg-[#ebe3d8] px-7 text-center">
              <h2 className="text-2xl font-medium">{selectedFeedback ? 'Thank you for sharing your taste' : 'You’re all caught up'}</h2>
              <p className="mt-4 max-w-sm text-sm leading-6 text-[#6d6257]">Your preferences help shape future recommendations.</p>
              {pendingMessage && <p role="status" className="mt-5 text-sm text-[#6d6257]">{pendingMessage}</p>}
            </motion.section>
          )}
        </AnimatePresence>
        {errorMessage && <p role="alert" className="mx-auto mt-5 max-w-xl text-sm text-red-700">{errorMessage}</p>}
        <details className="mx-auto mt-10 max-w-xl border-t border-[#d8cec2] py-5">
          <summary className="min-h-11 cursor-pointer text-sm font-medium text-[#6d6257]">Your style preferences</summary>
          <div className="mt-4"><FashionDnaPanel signals={signals} feedbackCount={swipeCount} /></div>
        </details>
      </div>
    </main>
  )
}
