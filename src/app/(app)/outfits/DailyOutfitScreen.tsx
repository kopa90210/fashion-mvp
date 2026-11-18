'use client'

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Bookmark, Check, Heart, ThumbsDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DailyOutfit } from '@/src/app/actions/outfit'
import { submitOutfitFeedback, getDailyOutfit } from '@/src/app/actions/outfit'
import { recordOutfitNotToday, recordOutfitWorn } from '@/src/app/actions/outfit-interactions'
import { isOutfitSaved, saveOutfitLook, unsaveOutfitLook } from '@/src/app/actions/profile'
import { getChangedTags, getOptimisticVector } from '@/src/lib/outfit/feedback-helpers'
import OutfitCanvas from '@/src/components/outfit/OutfitCanvas'
import SwapOutfitFlow from './SwapOutfitFlow'

export type SavedStatus = 'saved' | 'unsaved' | 'unknown'

export default function DailyOutfitScreen({
  outfit,
  ownedItemIds = [],
  initialSaved = null,
  onSavedStatusChange,
}: {
  outfit: DailyOutfit
  initialSignals?: unknown
  feedbackCount?: number
  ownedItemIds?: string[]
  initialSaved?: boolean | null
  onSavedStatusChange?: (status: SavedStatus) => void
}) {
  const [currentOutfit, setCurrentOutfit] = useState(outfit)
  const [viewState, setViewState] = useState<'outfit' | 'loading' | 'done'>('outfit')
  const [vector, setVector] = useState(outfit.vector)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [swapOwnedIds, setSwapOwnedIds] = useState<string[]>([])
  const [pendingInteraction, setPendingInteraction] = useState<{ outfitId: string; event: 'worn' | 'not_today' } | null>(null)
  const [completedInteraction, setCompletedInteraction] = useState<{ outfitId: string; event: 'worn' | 'not_today' } | null>(null)
  const [interactionError, setInteractionError] = useState<{ outfitId: string; message: string } | null>(null)

  // Saved state management per outfit ID
  const [savedMap, setSavedMap] = useState<Record<string, SavedStatus>>(() => ({
    [outfit.id]: initialSaved === true ? 'saved' : initialSaved === false ? 'unsaved' : 'unknown',
  }))
  const [isSavePending, setIsSavePending] = useState(false)

  // Per-outfit revision counters to guard against out-of-order lookups overwriting newer mutations
  const outfitRevisions = useRef<Record<string, number>>({})
  // Outfits whose state was already definitively resolved by the server (avoid unnecessary client lookups)
  const serverResolvedOutfits = useRef(new Set<string>(initialSaved !== null ? [outfit.id] : []))

  // Helper to update saved status and notify callback if provided
  const updateSaved = useCallback((status: SavedStatus, targetOutfitId: string) => {
    setSavedMap((prev) => ({ ...prev, [targetOutfitId]: status }))
    onSavedStatusChange?.(status)
  }, [onSavedStatusChange])

  // Style feedback management per outfit ID
  const [feedbackMap, setFeedbackMap] = useState<Record<string, { liked: boolean; status: 'pending' | 'persisted' }>>({})
  const [isFeedbackPending, setIsFeedbackPending] = useState(false)
  const [feedbackNotice, setFeedbackNotice] = useState<{ outfitId: string; message: string } | null>(null)

  const interactionLock = useRef(false)
  const [, startTransition] = useTransition()

  // Resolve saved status when the displayed outfit changes or is unconfirmed
  useEffect(() => {
    const outfitId = currentOutfit.id
    if (serverResolvedOutfits.current.has(outfitId)) return
    if (savedMap[outfitId] === 'saved' || savedMap[outfitId] === 'unsaved') return

    // Monotonic revision token for this lookup
    const rev = (outfitRevisions.current[outfitId] ?? 0) + 1
    outfitRevisions.current[outfitId] = rev

    let cancelled = false
    async function resolveSaved() {
      try {
        const saved = await isOutfitSaved(outfitId)
        // Guard: check both component unmount/cancellation and mutation revision
        if (!cancelled && outfitRevisions.current[outfitId] === rev) {
          updateSaved(saved ? 'saved' : 'unsaved', outfitId)
        }
      } catch {
        if (!cancelled && outfitRevisions.current[outfitId] === rev) {
          updateSaved('unknown', outfitId)
        }
      }
    }

    void resolveSaved()

    return () => {
      cancelled = true
    }
  }, [currentOutfit.id, savedMap, updateSaved])

  const changedTags = useMemo(() => getChangedTags(currentOutfit), [currentOutfit])
  const owned = new Set([...ownedItemIds, ...swapOwnedIds])
  const personal = currentOutfit.items.length > 0 && currentOutfit.items.every((item) => owned.has(item.id))
  const identity = currentOutfit.items
    .filter((item) => ['base_layer', 'bottom', 'one_piece', 'footwear'].includes(item.layer_role))
    .map((item) => item.display_name.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(' · ')
  const currentInteraction = completedInteraction?.outfitId === currentOutfit.id ? completedInteraction.event : null
  const interactionIsPending = pendingInteraction?.outfitId === currentOutfit.id

  const currentSavedStatus: SavedStatus = savedMap[currentOutfit.id] ?? 'unknown'
  const isSaved = currentSavedStatus === 'saved'
  const isUnknown = currentSavedStatus === 'unknown'
  const currentFeedback = feedbackMap[currentOutfit.id]

  const saveLabel = isSaved
    ? 'Remove from saved looks'
    : isUnknown
      ? 'Save this look (status unconfirmed)'
      : 'Save this look'

  const saveTitle = isSaved
    ? 'Saved to Lookbook'
    : isUnknown
      ? 'Status unconfirmed · Click to save'
      : 'Save this look'

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
        setPendingInteraction((current) => (current?.outfitId === outfitId ? null : current))
      }
    })
  }

  function handleToggleSave() {
    if (isSavePending) return
    const outfitId = currentOutfit.id
    const prevStatus = savedMap[outfitId] ?? 'unknown'
    const nextSaved = prevStatus !== 'saved'

    // Advance mutation revision for this outfitId so in-flight lookups are invalidated immediately
    const mutationRev = (outfitRevisions.current[outfitId] ?? 0) + 1
    outfitRevisions.current[outfitId] = mutationRev

    setIsSavePending(true)
    updateSaved(nextSaved ? 'saved' : 'unsaved', outfitId)

    startTransition(async () => {
      try {
        if (nextSaved) await saveOutfitLook(outfitId)
        else await unsaveOutfitLook(outfitId)
      } catch {
        // Rollback on failure only if no newer mutation has taken place
        if (outfitRevisions.current[outfitId] === mutationRev) {
          updateSaved(prevStatus, outfitId)
        }
      } finally {
        setIsSavePending(false)
      }
    })
  }

  function handleFeedback(liked: boolean) {
    if (isFeedbackPending || currentFeedback !== undefined) return

    const outfitId = currentOutfit.id
    const priorVector = vector
    const idempotencyKey = `outfit-feedback:${outfitId}`

    setIsFeedbackPending(true)
    setErrorMessage(null)
    setFeedbackNotice(null)
    setVector((current) => getOptimisticVector(current, changedTags, liked))

    if (liked) {
      setFeedbackMap((prev) => ({ ...prev, [outfitId]: { liked: true, status: 'pending' } }))
    } else {
      setViewState('loading')
    }

    startTransition(async () => {
      try {
        const result = await submitOutfitFeedback(outfitId, liked, idempotencyKey)
        setVector(result.vector)

        if (liked) {
          setFeedbackMap((prev) => ({ ...prev, [outfitId]: { liked: true, status: 'persisted' } }))
          setFeedbackNotice({ outfitId, message: 'Preference saved' })
        } else {
          const nextOutfit = await getDailyOutfit()
          if (nextOutfit) {
            setCurrentOutfit(nextOutfit)
            setViewState('outfit')
          } else {
            setViewState('done')
            setPendingMessage('No more outfits available today.')
          }
        }
      } catch {
        setErrorMessage('Could not save your preference. Please try again.')
        setVector(priorVector)
        if (liked) {
          setFeedbackMap((prev) => {
            const next = { ...prev }
            delete next[outfitId]
            return next
          })
        } else {
          setViewState('outfit')
        }
      } finally {
        setIsFeedbackPending(false)
      }
    })
  }

  return (
    <main className="px-5 py-7 text-[#1d1b18] sm:px-8 lg:py-10">
      <div className="mx-auto max-w-xl">
        <header className="mb-6">
          <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Today</h1>
          {personal ? (
            <p className="mt-2 text-sm text-[#6d6257]">From your wardrobe</p>
          ) : (
            <>
              <p className="mt-2 text-sm text-[#6d6257]">Style inspiration</p>
              <p className="mt-1 text-sm leading-6 text-[#6d6257]">
                A look to explore your preferences. These pieces are not all part of your confirmed wardrobe.
              </p>
            </>
          )}
        </header>

        <AnimatePresence mode="wait">
          {viewState === 'outfit' ? (
            <motion.section
              key={currentOutfit.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              <OutfitCanvas
                items={currentOutfit.items}
                identity={identity || 'A look for you'}
                reasons={currentOutfit.reasons}
                variant="editorial"
                reasonsDefaultOpen={false}
              >
                {personal ? (
                  <section aria-label="Today's outfit decision" className="mt-6 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <Button
                        type="button"
                        onClick={() => handleInteraction('worn')}
                        disabled={interactionIsPending || currentInteraction !== null}
                        className="h-12 flex-1 rounded-full bg-[#1d1b18] text-[#fffdfa] hover:bg-[#33302a] transition-colors"
                      >
                        {currentInteraction === 'worn' && <Check aria-hidden="true" className="size-4" />}
                        {currentInteraction === 'worn' ? 'Locked in' : 'Wear this'}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleToggleSave}
                        disabled={isSavePending}
                        aria-label={saveLabel}
                        aria-pressed={isSaved}
                        data-saved-status={currentSavedStatus}
                        title={saveTitle}
                        className={`size-12 shrink-0 rounded-full border transition-colors ${
                          isSaved
                            ? 'border-[#596c5e] bg-[#596c5e]/10 text-[#596c5e]'
                            : isUnknown
                              ? 'border-[#d8cec2] border-dashed bg-[#fffdfa] text-[#6d6257] hover:border-[#1d1b18] hover:text-[#1d1b18]'
                              : 'border-[#d8cec2] bg-[#fffdfa] text-[#6d6257] hover:border-[#1d1b18] hover:text-[#1d1b18]'
                        }`}
                      >
                        <Bookmark className={`size-5 ${isSaved ? 'fill-current' : ''}`} />
                        {isUnknown && <span className="sr-only">(status unconfirmed)</span>}
                      </Button>
                    </div>

                    <SwapOutfitFlow
                      outfit={currentOutfit}
                      triggerText="Swap a piece"
                      onApplied={(derivedOutfit) => {
                        setCurrentOutfit(derivedOutfit)
                        setSwapOwnedIds((ids) => [...new Set([...ids, ...derivedOutfit.items.map((item) => item.id)])])
                      }}
                    />

                    <div className="flex justify-center pt-0.5">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => handleInteraction('not_today')}
                        disabled={interactionIsPending || currentInteraction !== null}
                        className="h-10 rounded-full px-5 text-sm font-normal text-[#6d6257] hover:bg-[#ebe3d8]/60 hover:text-[#1d1b18]"
                      >
                        Not today
                      </Button>
                    </div>

                    {currentInteraction === 'not_today' && (
                      <p role="status" className="mt-2 text-center text-sm leading-6 text-[#6d6257]">
                        Got it — we&apos;ll treat this as a today decision, not a style dislike.
                      </p>
                    )}
                    {interactionError?.outfitId === currentOutfit.id && (
                      <p role="alert" className="mt-2 text-center text-sm text-red-700">
                        {interactionError.message}
                      </p>
                    )}
                  </section>
                ) : (
                  <section aria-label="Today's outfit decision" className="mt-6">
                    <div className="flex items-center justify-between gap-3 rounded-2xl border border-[#d8cec2] bg-[#fffdfa] p-4">
                      <div className="min-w-0 pr-2">
                        <p className="text-sm font-medium text-[#1d1b18]">Style inspiration</p>
                        <p className="mt-1 text-xs leading-5 text-[#6d6257]">
                          These pieces are not all part of your confirmed wardrobe.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={handleToggleSave}
                        disabled={isSavePending}
                        aria-label={saveLabel}
                        aria-pressed={isSaved}
                        data-saved-status={currentSavedStatus}
                        title={saveTitle}
                        className={`size-12 shrink-0 rounded-full border transition-colors ${
                          isSaved
                            ? 'border-[#596c5e] bg-[#596c5e]/10 text-[#596c5e]'
                            : isUnknown
                              ? 'border-[#d8cec2] border-dashed bg-[#fffdfa] text-[#6d6257] hover:border-[#1d1b18] hover:text-[#1d1b18]'
                              : 'border-[#d8cec2] bg-[#fffdfa] text-[#6d6257] hover:border-[#1d1b18] hover:text-[#1d1b18]'
                        }`}
                      >
                        <Bookmark className={`size-5 ${isSaved ? 'fill-current' : ''}`} />
                        {isUnknown && <span className="sr-only">(status unconfirmed)</span>}
                      </Button>
                    </div>
                  </section>
                )}
              </OutfitCanvas>

              <details className="mt-7 border-t border-[#d8cec2] pt-5">
                <summary className="min-h-11 cursor-pointer text-sm font-medium text-[#6d6257] transition-colors hover:text-[#1d1b18]">
                  Help improve your recommendations
                </summary>
                <div className="mt-4">
                  <p className="mb-3 text-sm text-[#6d6257]">Do you like this style?</p>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleFeedback(false)}
                      disabled={isFeedbackPending || currentFeedback !== undefined}
                      className="h-12 flex-1 rounded-full border-[#d8cec2] bg-[#fffdfa]"
                    >
                      <ThumbsDown aria-hidden="true" className="size-4" />
                      Not my style
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleFeedback(true)}
                      disabled={isFeedbackPending || currentFeedback !== undefined}
                      className={`h-12 flex-1 rounded-full text-[#fffdfa] ${
                        currentFeedback?.liked ? 'bg-[#596c5e]' : 'bg-[#1d1b18]'
                      }`}
                    >
                      <Heart aria-hidden="true" className="size-4" />
                      {currentFeedback?.liked ? 'Loved' : 'Love this'}
                    </Button>
                  </div>
                  {feedbackNotice?.outfitId === currentOutfit.id && (
                    <p role="status" className="mt-2.5 flex items-center gap-1.5 text-xs font-medium text-[#596c5e]">
                      <Check aria-hidden="true" className="size-3.5" />
                      {feedbackNotice.message}
                    </p>
                  )}
                  {errorMessage && <p role="alert" className="mt-2.5 text-xs text-red-700">{errorMessage}</p>}
                </div>
              </details>
            </motion.section>
          ) : viewState === 'loading' ? (
            <motion.section
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[55vh] flex-col items-center justify-center gap-4 rounded-3xl bg-[#ebe3d8]"
              role="status"
            >
              <div
                aria-hidden="true"
                className="size-6 animate-spin rounded-full border-2 border-[#d8cec2] border-t-[#6d6257]"
              />
              <p className="text-sm text-[#6d6257]">Finding another outfit…</p>
            </motion.section>
          ) : (
            <motion.section
              key="done"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex min-h-[55vh] flex-col items-center justify-center rounded-3xl bg-[#ebe3d8] px-7 text-center"
            >
              <h2 className="text-2xl font-medium">You’re all caught up</h2>
              <p className="mt-4 max-w-sm text-sm leading-6 text-[#6d6257]">
                Your preferences help shape future recommendations.
              </p>
              {pendingMessage && <p role="status" className="mt-5 text-sm text-[#6d6257]">{pendingMessage}</p>}
            </motion.section>
          )}
        </AnimatePresence>
      </div>
    </main>
  )
}
