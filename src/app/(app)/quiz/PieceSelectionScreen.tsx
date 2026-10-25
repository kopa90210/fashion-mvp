'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Search, X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import GarmentCard from '@/src/components/wardrobe/GarmentCard'
import {
  CuratedItem,
  getRankedPieces,
  searchPieces,
  saveWardrobeSelection,
  type PendingOwnedSelection,
} from '@/src/app/actions/wardrobe'
import { SELECTION_STEPS } from './selection-steps'
import { STYLE_SELECTION_COPY } from './selection-copy'

export default function PieceSelectionScreen({ pending }: { pending: PendingOwnedSelection }) {
  const router = useRouter()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [selections, setSelections] = useState<Record<string, Set<string>>>(() => {
    const groups: Record<string, Set<string>> = {}
    for (const item of pending.items) {
      (groups[item.category] ??= new Set()).add(item.id)
    }
    return groups
  })
  const [selectionVersion, setSelectionVersion] = useState(pending.version)
  const versionRef = useRef(pending.version)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const [previewItem, setPreviewItem] = useState<CuratedItem | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Per-step data state
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, CuratedItem[]>>(() => {
    const grouped: Record<string, CuratedItem[]> = {}
    for (const item of pending.items) (grouped[item.category] ??= []).push(item)
    return grouped
  })
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [batch, setBatch] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CuratedItem[]>([])
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentStep = SELECTION_STEPS[currentStepIndex]
  const currentCategory = currentStep.category

  const items = itemsByCategory[currentCategory] ?? []
  const currentSelectedIds = useMemo(
    () => selections[currentCategory] ?? new Set<string>(),
    [selections, currentCategory],
  )
  const selectedCount = currentSelectedIds.size

  const isFinalStep = currentStepIndex === SELECTION_STEPS.length - 1
  const isStepValid = true

  // Total selected across all steps
  const totalSelectedCount = Object.values(selections).reduce(
    (acc, set) => acc + set.size,
    0,
  )

  // Fetch initial batch for current step
  const loadStepData = useCallback(async (cat: string) => {
    setIsLoading(true)
    setBatch(0)
    setIsSearchOpen(false)
    setSearchQuery('')
    setSearchResults([])

    try {
      const res = await getRankedPieces(cat, 0)
      setItemsByCategory((prev) => {
        const existing = prev[cat] ?? []
        const seen = new Set(existing.map((item) => item.id))
        const merged = [...existing, ...res.items.filter((item) => !seen.has(item.id))]
        return { ...prev, [cat]: merged }
      })
      setHasMore(res.hasMore)
    } catch (err) {
      console.error('Failed to load step items:', err)
      setItemsByCategory((prev) => (prev[cat] ? prev : { ...prev, [cat]: [] }))
      setHasMore(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStepData(currentCategory)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [currentCategory, loadStepData])

  // Load next batch ("Show more")
  const handleShowMore = async () => {
    if (isLoadingMore || !hasMore || batch >= 2) return
    setIsLoadingMore(true)
    const nextBatch = batch + 1

    try {
      const res = await getRankedPieces(
        currentCategory,
        nextBatch,
        items.map((i) => i.id), // never re-show what's already on screen
      )
      setItemsByCategory((prev) => {
        const existing = prev[currentCategory] ?? []
        const seen = new Set(existing.map((item) => item.id))
        const merged = [...existing, ...res.items.filter((item) => !seen.has(item.id))]
        return { ...prev, [currentCategory]: merged }
      })
      setBatch(nextBatch)
      setHasMore(res.hasMore && nextBatch < 2)
    } catch (err) {
      console.error('Failed to load more items:', err)
    } finally {
      setIsLoadingMore(false)
    }
  }

  // Handle Search Input with 300ms debounce
  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)

    if (!val.trim()) {
      setSearchResults([])
      return
    }

    searchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPieces(currentCategory, val)
        setSearchResults(results)
        setItemsByCategory((prev) => {
          const existing = prev[currentCategory] ?? []
          const seen = new Set(existing.map((item) => item.id))
          const merged = [...existing, ...results.filter((item) => !seen.has(item.id))]
          return { ...prev, [currentCategory]: merged }
        })
      } catch (err) {
        console.error('Search error:', err)
        setSearchResults([])
      }
    }, 300)
  }

  const persistSelection = (next: Record<string, Set<string>>) => {
    const ids = Object.values(next).flatMap((set) => Array.from(set))
    saveQueue.current = saveQueue.current.then(async () => {
      const result = await saveWardrobeSelection(ids, versionRef.current)
      versionRef.current = result.version
      setSelectionVersion(result.version)
    }).catch(() => {
      setSubmitError('We could not save that change. Refresh and try again.')
    })
  }

  const toggleSelection = (id: string) => {
    if (isSubmitting) return
    const catSet = new Set(selections[currentCategory] ?? [])
    if (catSet.has(id)) catSet.delete(id)
    else catSet.add(id)
    const next = { ...selections, [currentCategory]: catSet }
    setSelections(next)
    persistSelection(next)
  }

  const clearCurrentStep = () => {
    const next = { ...selections, [currentCategory]: new Set<string>() }
    setSelections(next)
    persistSelection(next)
  }

  const handleNextStep = () => {
    if (!isStepValid) return
    if (currentStepIndex < SELECTION_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      handleSubmit()
    }
  }

  const handlePrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex((prev) => prev - 1)
    }
  }

  const handleSubmit = async () => {
    setSubmitError(null)
    setIsSubmitting(true)

    // Aggregate all selected IDs across all categories
    const allSelectedIds = Object.values(selections).flatMap((set) =>
      Array.from(set),
    )

    try {
      await saveQueue.current
      const result = await saveWardrobeSelection(allSelectedIds, versionRef.current)
      versionRef.current = result.version
      setSelectionVersion(result.version)
      router.push('/outfits/calibration')
    } catch (err) {
      console.error('Failed to submit style selection:', err)
      setIsSubmitting(false)
      setSubmitError('We could not save your selections. Please try again.')
    }
  }

  // Active items list (search mode vs threshold ranked mode)
  // const displayItems = searchQuery.trim() ? searchResults : items
// Active items list (search mode vs threshold ranked mode).
  // Deduped defensively - a growing, paginated list is exactly the kind
  // of state that can pick up an accidental repeat; this guarantees the
  // render never breaks on it even if a future data source slips one in.
  const rawDisplayItems = searchQuery.trim() ? searchResults : items
  const displayItems = useMemo(() => {
    const seen = new Set<string>()
    return rawDisplayItems.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [rawDisplayItems])
  // Submission screen: curated picks become style signals, not ownership.
  if (isSubmitting) {
    return (
      <div className="stylegraph-quiz-surface flex w-full flex-col items-center justify-center bg-[#070708] px-6 text-white overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 max-w-md"
        >
          <Sparkles className="h-10 w-10 mx-auto text-amber-300 animate-pulse" />
          <h1 className="text-3xl font-bold tracking-tight">
            {STYLE_SELECTION_COPY.submitTitle}
          </h1>
          <p className="text-sm text-white/50">
            {STYLE_SELECTION_COPY.submitBody}
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="stylegraph-quiz-surface bg-gradient-to-b from-[#0a0a0c] via-[#0d0d12] to-[#070708] pb-[calc(6rem+env(safe-area-inset-bottom))] pt-8 text-white px-4 sm:px-6 md:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        
        {/* Step Header & Progress */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentStepIndex > 0 && (
                <button
                  type="button"
                  onClick={handlePrevStep}
                  className="rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
                  aria-label="Previous step"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200/80">
                Step {currentStepIndex + 1} of {SELECTION_STEPS.length} - {currentStep.label}
              </span>
            </div>

          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-200 rounded-full"
              initial={{ width: '0%' }}
              animate={{
                width: `${((currentStepIndex + 1) / SELECTION_STEPS.length) * 100}%`,
              }}
              transition={{ duration: 0.3 }}
            />
          </div>

          {/* Step Heading + Search Toggle */}
          <div className="flex items-end justify-between gap-4 pt-2">
            <div>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {STYLE_SELECTION_COPY.title}
              </h1>
              <p className="mt-2 max-w-xl text-xs leading-5 text-white/40">
                {STYLE_SELECTION_COPY.description}
              </p>
            </div>

            {/* Search Toggle Icon */}
            <button
              type="button"
              onClick={() => {
                setIsSearchOpen((prev) => !prev)
                if (isSearchOpen) {
                  setSearchQuery('')
                  setSearchResults([])
                }
              }}
              className={`rounded-full p-2.5 transition-colors ${
                isSearchOpen
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
              }`}
              aria-label="Toggle search"
            >
              {isSearchOpen ? <X className="h-4 w-4" /> : <Search className="h-4 w-4" />}
            </button>
          </div>

          {/* Search Input Bar (when expanded) */}
          <AnimatePresence>
            {isSearchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="relative pt-2">
                  <Search className="absolute left-3.5 top-5 h-4 w-4 text-white/40" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder={`Search ${currentStep.label.toLowerCase()}...`}
                    className="w-full rounded-xl border border-white/15 bg-white/5 py-2.5 pl-10 pr-4 text-sm text-white placeholder-white/40 focus:border-amber-300 focus:outline-none"
                    autoFocus
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Wardrobe Reveal Staggered Grid */}
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
               className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
            >
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-[3/4] animate-pulse rounded-2xl border border-white/10 bg-white/5"
                />
              ))}
            </motion.div>
          ) : (
            <motion.div
              key={`${currentCategory}-${searchQuery}`}
              initial={{ opacity: 0, filter: 'blur(8px)' }}
              animate={{ opacity: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, filter: 'blur(8px)' }}
              transition={{ duration: 0.15 }}
            >
              {displayItems.length === 0 ? (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-center p-6">
                  <p className="text-sm font-medium text-white/60">
                    {searchQuery.trim()
                      ? `No ${currentStep.label.toLowerCase()} match "${searchQuery}".`
                      : `No items available in this category.`}
                  </p>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex gap-4 overflow-x-auto pb-4 pt-1 pr-14 snap-x snap-mandatory scrollbar-none">
                  {displayItems.map((item, index) => {
                    return (
                      <motion.div
                        key={item.id}
                        layout
                        layoutId={`card-${item.id}`}
                        initial={{ opacity: 0, y: 16, filter: 'blur(4px)' }}
                        animate={{
                          opacity: 1,
                          scale: 1,
                          y: 0,
                          filter: 'blur(0px)',
                        }}
                        transition={{
                          delay: index * 0.04,
                          duration: 0.3,
                          ease: 'easeOut',
                        }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setPreviewItem(item)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            setPreviewItem(item)
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        aria-label={`Preview ${item.display_name}`}
                        className="relative w-32 shrink-0 cursor-pointer snap-start"
                      >
                        <GarmentCard
                          image={item.image_url}
                          name={item.display_name}
                          category={item.category}
                          variant="style_reference"
                          selected={currentSelectedIds.has(item.id)}
                          selectionLabel={STYLE_SELECTION_COPY.selectedCardLabel}
                          selectionMode
                        />
                      </motion.div>
                    )
                  })}
                  </div>
                  {!searchQuery.trim() && hasMore && (
                    <button
                      type="button"
                      onClick={handleShowMore}
                      disabled={isLoadingMore}
                      aria-label="Show more pieces"
                      className={`absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-[#17171a]/90 text-white shadow-lg backdrop-blur transition-all hover:bg-white/15 hover:text-amber-200 ${
                        isLoadingMore ? 'pointer-events-none opacity-50' : ''
                      }`}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  )}
                </div>
              )}

              {/* Hand tray - pieces the user has picked up for this step */}
              <div className="mt-4 flex min-h-[68px] items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <span className="shrink-0 text-xs text-white/40">Selected</span>
                <div className="flex flex-1 flex-wrap gap-2">
                  {currentSelectedIds.size === 0 ? (
                    <span className="text-xs text-white/30">None selected yet</span>
                  ) : (
                    Array.from(currentSelectedIds).map((id) => {
                      const item = itemsByCategory[currentCategory]?.find((i) => i.id === id)
                      const label = item?.display_name ?? id + ' - Loading details...'

                      return (
                        <motion.button
                          key={id}
                          layoutId={`card-${id}`}
                          // The queued save ref is read only when this click handler runs.
                          // eslint-disable-next-line react-hooks/refs
                          onClick={() => toggleSelection(id)}
                          className="flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-200"
                        >
                          <span>{STYLE_SELECTION_COPY.selectedCardLabel}</span>
                          <span className="sr-only">: {label}</span>
                          <X className="h-3 w-3" />
                        </motion.button>
                      )
                    })
                  )}
                </div>
              </div>

              <button type="button" onClick={clearCurrentStep} className="mt-3 text-xs text-amber-200 underline underline-offset-4">
                {STYLE_SELECTION_COPY.emptySelection}
              </button>

            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {previewItem && (
        <div role="dialog" aria-modal="true" aria-label={`Preview ${previewItem.display_name}`} className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-[#17171a] p-5">
            <button type="button" onClick={() => setPreviewItem(null)} aria-label="Close preview" className="mb-3 ml-auto block text-white"><X /></button>
            <GarmentCard image={previewItem.image_url} name={previewItem.display_name} category={previewItem.category} variant="style_reference" selected={Boolean(selections[previewItem.category]?.has(previewItem.id))} selectionMode />
            <button type="button" onClick={() => { toggleSelection(previewItem.id); setPreviewItem(null) }} className="mt-4 w-full rounded-full bg-amber-300 px-5 py-3 text-sm font-semibold text-black">
              {selections[previewItem.category]?.has(previewItem.id) ? 'Remove from selected pieces' : STYLE_SELECTION_COPY.selectedCardLabel}
            </button>
          </div>
        </div>
      )}

      {submitError && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 mx-auto max-w-4xl rounded-xl border border-red-300/30 bg-red-950/90 px-4 py-3 text-sm text-red-100">
          <div className="flex items-center justify-between gap-3">
            <span>{submitError}</span>
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-lg bg-white/10 px-3 py-1.5 font-semibold hover:bg-white/20"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Sticky Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#070708]/90 px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur-lg">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="text-xs text-white/60">
            <span className="font-medium text-white">
              {selectedCount}
            </span>{' '}
            selected in {currentStep.label.toLowerCase()} ({totalSelectedCount} total)
            <span className="sr-only">Selection version {selectionVersion}</span>
          </div>

          <div className="flex items-center gap-3">
            {currentStepIndex > 0 && (
              <button
                type="button"
                onClick={handlePrevStep}
                className="rounded-full px-4 py-2.5 text-xs font-semibold text-white/70 hover:text-white transition-colors"
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handleNextStep}
              disabled={!isStepValid}
              className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-semibold transition-all ${
                isStepValid
                  ? 'bg-amber-300 text-black hover:bg-amber-200 shadow-md'
                  : 'cursor-not-allowed bg-white/10 text-white/30'
              }`}
            >
              {currentStepIndex === SELECTION_STEPS.length - 1 ? (
                STYLE_SELECTION_COPY.continueWithCount(totalSelectedCount)
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
        {isFinalStep && <p className="mx-auto mt-2 max-w-4xl text-right text-xs text-white/50">Your selected pieces will be added to your wardrobe after calibration.</p>}
      </div>
    </div>
  )
}
