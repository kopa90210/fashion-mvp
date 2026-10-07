'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Check, Search, X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import {
  CuratedItem,
  getRankedPieces,
  searchPieces,
  saveWardrobeSelection,
} from '@/src/app/actions/wardrobe'
import { isCalibrationSelectionEligible, SELECTION_STEPS } from './selection-steps'

export default function PieceSelectionScreen() {
  const router = useRouter()
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [selections, setSelections] = useState<Record<string, Set<string>>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Per-step data state
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, CuratedItem[]>>({})
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

  const selectionCounts = Object.fromEntries(
    Object.entries(selections).map(([category, selected]) => [category, selected.size]),
  )
  const isFinalStep = currentStepIndex === SELECTION_STEPS.length - 1
  const isGloballyEligible = isCalibrationSelectionEligible(selectionCounts)
  const isStepValid = isFinalStep
    ? isGloballyEligible
    : currentStep.required
      ? selectedCount >= currentStep.minSelections
      : true

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

  const toggleSelection = (id: string) => {
    setSelections((prev) => {
      const catSet = new Set(prev[currentCategory] ?? [])
      if (catSet.has(id)) {
        catSet.delete(id)
      } else {
        catSet.add(id)
      }
      return { ...prev, [currentCategory]: catSet }
    })
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

  const handleSkipStep = () => {
    if (currentStep.required) return
    if (currentStepIndex < SELECTION_STEPS.length - 1) {
      setCurrentStepIndex((prev) => prev + 1)
    } else {
      handleSubmit()
    }
  }

  const handleSubmit = async () => {
    if (!isGloballyEligible) {
      setSubmitError('Choose either 2 tops + 2 bottoms, or at least 2 dresses/one-piece looks, plus 2 footwear options.')
      return
    }
    setSubmitError(null)
    setIsSubmitting(true)

    // Aggregate all selected IDs across all categories
    const allSelectedIds = Object.values(selections).flatMap((set) =>
      Array.from(set),
    )

    try {
      await saveWardrobeSelection(allSelectedIds)
      setTimeout(() => {
        router.push('/outfits')
      }, 2200)
    } catch (err) {
      console.error('Failed to submit wardrobe selection:', err)
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
      if (seen.has(item.id) || currentSelectedIds.has(item.id)) return false
      seen.add(item.id)
      return true
    })
  }, [rawDisplayItems, currentSelectedIds])
  // Submission screen ("Building your wardrobe...")
  if (isSubmitting) {
    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center bg-[#070708] px-6 text-white overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 max-w-md"
        >
          <Sparkles className="h-10 w-10 mx-auto text-amber-300 animate-pulse" />
          <h1 className="text-3xl font-bold tracking-tight">
            Building your wardrobe...
          </h1>
          <p className="text-sm text-white/50">
            Fusing your chosen pieces with your Style DNA to generate your first look.
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0c] via-[#0d0d12] to-[#070708] pb-32 pt-8 text-white px-4 sm:px-6 md:px-8">
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

            {/* Optional Step Skip Button */}
            {!currentStep.required && (
              <button
                type="button"
                onClick={handleSkipStep}
                className="text-xs text-white/50 hover:text-white underline-offset-4 hover:underline transition-colors"
              >
                Skip this step
              </button>
            )}
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
                Choose your {currentStep.label.toLowerCase()}
              </h1>
              <p className="text-xs text-white/50 mt-1">
                {isFinalStep && !isGloballyEligible
                  ? 'Choose either tops + bottoms, or at least 2 dresses/one-piece looks, plus footwear.'
                  : currentStep.required
                  ? `Select at least ${currentStep.minSelections} items to advance.`
                  : 'Optional - select any pieces you own or skip.'}
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
                        onClick={() => toggleSelection(item.id)}
                        className="relative w-32 shrink-0 cursor-pointer snap-start"
                      >
                        <Card
                          className={`overflow-hidden rounded-2xl bg-white/5 border-2 transition-all ${
                            currentSelectedIds.has(item.id)
                              ? 'border-amber-300 ring-2 ring-amber-300/30'
                              : 'border-transparent hover:border-white/20'
                          }`}
                        >
                          <div className="relative aspect-[3/4] w-full bg-white/5">
                            {item.image_url ? (
                              <Image
                                src={item.image_url}
                                alt={item.display_name}
                                fill
                                sizes="(min-width: 1024px) 20vw, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
                                unoptimized
                                className="object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-white/10 text-xs text-white/30">
                                No Image
                              </div>
                            )}

                            <AnimatePresence>
                              {currentSelectedIds.has(item.id) && (
                                <motion.div
                                  initial={{ scale: 0, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                  exit={{ scale: 0, opacity: 0 }}
                                  className="absolute right-2 top-2"
                                >
                                  <Badge className="h-6 w-6 rounded-full p-0 flex items-center justify-center bg-amber-300 text-black shadow-md border-none">
                                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                                  </Badge>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <div className="p-3">
                            <p className="truncate text-sm font-medium text-white/90">
                              {item.display_name}
                            </p>
                          </div>
                        </Card>
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
                <span className="shrink-0 text-xs text-white/40">In hand</span>
                <div className="flex flex-1 flex-wrap gap-2">
                  {currentSelectedIds.size === 0 ? (
                    <span className="text-xs text-white/30">Tap a piece on the rail to pick it up</span>
                  ) : (
                    Array.from(currentSelectedIds).map((id) => {
                      const item = itemsByCategory[currentCategory]?.find((i) => i.id === id)
                      const label = item?.display_name ?? id + ' - Loading details...'

                      return (
                        <motion.button
                          key={id}
                          layoutId={`card-${id}`}
                          onClick={() => toggleSelection(id)}
                          className="flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-medium text-amber-200"
                        >
                          {label}
                          <X className="h-3 w-3" />
                        </motion.button>
                      )
                    })
                  )}
                </div>
              </div>

            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {submitError && (
        <div className="fixed bottom-20 left-4 right-4 z-50 mx-auto max-w-4xl rounded-xl border border-red-300/30 bg-red-950/90 px-4 py-3 text-sm text-red-100">
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
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-white/10 bg-[#070708]/90 px-6 py-4 backdrop-blur-lg">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="text-xs text-white/60">
            <span className="font-medium text-white">
              {selectedCount}
            </span>{' '}
            selected in {currentStep.label.toLowerCase()} ({totalSelectedCount} total)
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
                'Build my wardrobe'
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
