'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { Search, X, ChevronRight, Sparkles } from 'lucide-react'
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
    const selectedIds = new Set(pending.itemIds)
    const groups: Record<string, Set<string>> = {}
    for (const item of pending.items) {
      if (selectedIds.has(item.id)) {
        (groups[item.category] ??= new Set()).add(item.id)
      }
    }
    return groups
  })
  const [selectionVersion, setSelectionVersion] = useState(pending.version)
  const versionRef = useRef(pending.version)
  const saveQueue = useRef<Promise<void>>(Promise.resolve())
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [liveAnnouncement, setLiveAnnouncement] = useState('')
  const pendingFocusIdRef = useRef<string | null>(null)

  // Per-step data state
  const [itemsByCategory, setItemsByCategory] = useState<Record<string, CuratedItem[]>>(() => {
    const grouped: Record<string, CuratedItem[]> = {}
    for (const item of pending.items) (grouped[item.category] ??= []).push(item)
    return grouped
  })
  const tabsContainerRef = useRef<HTMLDivElement>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [batch, setBatch] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isFetching, setIsFetching] = useState(
    () => !pending.items.some((item) => item.category === SELECTION_STEPS[0].category),
  )
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CuratedItem[]>([])
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const currentStep = SELECTION_STEPS[currentStepIndex]
  const currentCategory = currentStep.category

  const items = itemsByCategory[currentCategory] ?? []
  const isLoading = items.length === 0 && isFetching
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
    setIsFetching(true)
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
      setIsFetching(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadStepData(currentCategory)
    }, 0)

    return () => window.clearTimeout(timer)
  }, [currentCategory, loadStepData])

  // Scroll active tab into view horizontally if needed
  useEffect(() => {
    const activeTab = document.getElementById(`category-tab-${currentCategory}`)
    if (activeTab && tabsContainerRef.current) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    }
  }, [currentCategory])

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const nextIndex = (index + 1) % SELECTION_STEPS.length
      setCurrentStepIndex(nextIndex)
      document.getElementById(`category-tab-${SELECTION_STEPS[nextIndex].category}`)?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prevIndex = (index - 1 + SELECTION_STEPS.length) % SELECTION_STEPS.length
      setCurrentStepIndex(prevIndex)
      document.getElementById(`category-tab-${SELECTION_STEPS[prevIndex].category}`)?.focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      setCurrentStepIndex(0)
      document.getElementById(`category-tab-${SELECTION_STEPS[0].category}`)?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      const lastIndex = SELECTION_STEPS.length - 1
      setCurrentStepIndex(lastIndex)
      document.getElementById(`category-tab-${SELECTION_STEPS[lastIndex].category}`)?.focus()
    }
  }

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

  // Active items list (search mode vs threshold ranked mode).
  // Excludes items that are currently selected in this category so the rail only shows available pieces.
  const rawDisplayItems = searchQuery.trim() ? searchResults : items
  const displayItems = useMemo(() => {
    const seen = new Set<string>()
    return rawDisplayItems.filter((item) => {
      if (seen.has(item.id)) return false
      seen.add(item.id)
      return !currentSelectedIds.has(item.id)
    })
  }, [rawDisplayItems, currentSelectedIds])

  // Move focus to adjacent card or rail action when a focused card disappears
  useEffect(() => {
    if (pendingFocusIdRef.current === null) return
    const targetId = pendingFocusIdRef.current
    pendingFocusIdRef.current = null

    if (targetId) {
      const el = document.getElementById(`card-piece-${targetId}`)
      if (el) {
        el.focus()
        return
      }
    }

    // Fallback: rail empty-state action button or hand-tray first item
    const emptyAction = document.getElementById('empty-rail-action')
    if (emptyAction) {
      emptyAction.focus()
      return
    }

    const handItem = document.getElementById('hand-tray-first-item')
    if (handItem) {
      handItem.focus()
      return
    }

    const clearBtn = document.getElementById('clear-step-button')
    clearBtn?.focus()
  }, [displayItems])

  // One-tap piece selection directly from rail
  const handleSelectPiece = (item: CuratedItem, index: number) => {
    if (isSubmitting || currentSelectedIds.has(item.id)) return

    // If the card was focused (e.g. keyboard navigation), determine adjacent card to focus next
    const isCardFocused = document.activeElement?.id === `card-piece-${item.id}`
    if (isCardFocused) {
      const adjacent = displayItems[index + 1] ?? displayItems[index - 1]
      pendingFocusIdRef.current = adjacent?.id ?? ''
    }

    const catSet = new Set(selections[currentCategory] ?? [])
    catSet.add(item.id)
    const next = { ...selections, [currentCategory]: catSet }
    setSelections(next)
    persistSelection(next)
    setLiveAnnouncement(`Added ${item.display_name} to your hand`)
  }

  // Deselect piece from hand tray (returns it to its original position in the rail)
  const handleDeselectPiece = (id: string) => {
    if (isSubmitting || !currentSelectedIds.has(id)) return

    const item = itemsByCategory[currentCategory]?.find((i) => i.id === id)
    const catSet = new Set(selections[currentCategory] ?? [])
    catSet.delete(id)
    const next = { ...selections, [currentCategory]: catSet }
    setSelections(next)
    persistSelection(next)
    setLiveAnnouncement(
      item ? `Removed ${item.display_name} from your hand` : 'Removed piece from your hand',
    )
  }

  const clearCurrentStep = () => {
    if (isSubmitting) return
    const next = { ...selections, [currentCategory]: new Set<string>() }
    setSelections(next)
    persistSelection(next)
    setLiveAnnouncement(`Cleared all selected ${currentStep.label.toLowerCase()}`)
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

  // Submission screen: curated picks become style signals, not ownership.
  if (isSubmitting) {
    return (
      <div className="stylegraph-quiz-surface flex w-full flex-col items-center justify-center bg-[#141416] px-6 text-[#F5F1E9] overflow-hidden">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 max-w-md"
        >
          <Sparkles className="h-10 w-10 mx-auto text-[#E8C568] animate-pulse" />
          <h1 className="text-3xl font-bold tracking-tight text-[#F5F1E9]">
            {STYLE_SELECTION_COPY.submitTitle}
          </h1>
          <p className="text-sm text-[#B5B0A8]">
            {STYLE_SELECTION_COPY.submitBody}
          </p>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="stylegraph-quiz-surface min-h-[100dvh] bg-[#141416] pb-[calc(6rem+env(safe-area-inset-bottom))] pt-8 text-[#F5F1E9] px-4 sm:px-6 md:px-8">
      {/* Accessible live status announcements for screen readers */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {liveAnnouncement}
      </div>

      <div className="mx-auto max-w-4xl space-y-8">

        {/* Category Tabs & Header */}
        <div className="space-y-4">
          {/* Category Tabs */}
          <div
            ref={tabsContainerRef}
            role="tablist"
            aria-label="Clothing categories"
            className="flex gap-2 overflow-x-auto pb-1 scrollbar-none sm:gap-2.5"
          >
            {SELECTION_STEPS.map((step, idx) => {
              const isActive = idx === currentStepIndex
              const count = selections[step.category]?.size ?? 0
              return (
                <button
                  key={step.category}
                  role="tab"
                  id={`category-tab-${step.category}`}
                  aria-selected={isActive}
                  aria-controls={`category-panel-${step.category}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setCurrentStepIndex(idx)}
                  onKeyDown={(e) => handleTabKeyDown(e, idx)}
                  className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#E8C568] sm:text-sm ${
                    isActive
                      ? 'bg-[#E8C568] text-[#171717] shadow-sm'
                      : 'border border-[#38383D] bg-[#1E1E21] text-[#B5B0A8] hover:bg-[#252529] hover:text-[#F5F1E9]'
                    }`}
                >
                  <span>{step.label}</span>
                  {count > 0 && (
                    <span
                      className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${
                        isActive ? 'bg-[#171717] text-[#E8C568]' : 'bg-[#E8C568]/20 text-[#E8C568]'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Progress Bar */}
          <div className="h-1.5 w-full rounded-full bg-[#38383D] overflow-hidden" aria-hidden="true">
            <motion.div
              className="h-full bg-[#E8C568] rounded-full"
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
              <h1 className="text-2xl font-bold tracking-tight text-[#F5F1E9] sm:text-3xl">
                {STYLE_SELECTION_COPY.title}
              </h1>
              <p className="mt-2 max-w-xl text-xs leading-5 text-[#B5B0A8]">
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
              className={`rounded-full p-2.5 transition-colors focus-visible:ring-2 focus-visible:ring-[#E8C568] outline-none ${
                isSearchOpen
                  ? 'bg-[#E8C568] text-[#171717]'
                  : 'border border-[#38383D] bg-[#1E1E21] text-[#B5B0A8] hover:bg-[#252529] hover:text-[#F5F1E9]'
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
                  <Search className="absolute left-3.5 top-5 h-4 w-4 text-[#B5B0A8]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder={`Search ${currentStep.label.toLowerCase()}...`}
                    className="w-full rounded-xl border border-[#38383D] bg-[#1E1E21] py-2.5 pl-10 pr-4 text-sm text-[#F5F1E9] placeholder-[#B5B0A8]/60 focus:border-[#E8C568] focus:outline-none"
                    autoFocus
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Wardrobe Reveal Staggered Grid Tab Panel */}
        <div
          role="tabpanel"
          id={`category-panel-${currentCategory}`}
          aria-labelledby={`category-tab-${currentCategory}`}
        >
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
                    className="aspect-[3/4] animate-pulse rounded-2xl border border-[#38383D] bg-[#1E1E21]"
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
                  <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-[#38383D] bg-[#1E1E21] text-center p-6 space-y-3">
                    <p className="text-sm font-medium text-[#B5B0A8]">
                      {rawDisplayItems.length > 0
                        ? 'All shown pieces are in your hand.'
                        : searchQuery.trim()
                          ? `No ${currentStep.label.toLowerCase()} match "${searchQuery}".`
                          : `No items available in this category.`}
                    </p>
                    {!searchQuery.trim() && hasMore && (
                      <button
                        type="button"
                        id="empty-rail-action"
                        onClick={handleShowMore}
                        disabled={isLoadingMore}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#38383D] bg-[#252529] px-4 py-2 text-xs font-semibold text-[#F5F1E9] transition-all hover:border-[#E8C568]/40 hover:text-[#E8C568] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C568]"
                      >
                        <span>{isLoadingMore ? 'Loading pieces...' : 'Show more pieces'}</span>
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <div className="flex gap-4 overflow-x-auto pb-4 pt-1 pr-14 snap-x snap-mandatory scrollbar-none">
                      {displayItems.map((item, index) => {
                        return (
                          <motion.button
                            type="button"
                            key={item.id}
                            id={`card-piece-${item.id}`}
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
                            onClick={() => handleSelectPiece(item, index)}
                            aria-label={`Select ${item.display_name}`}
                            className="relative w-32 shrink-0 cursor-pointer snap-start text-left rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-[#E8C568]"
                          >
                            <GarmentCard
                              image={item.image_url}
                              name={item.display_name}
                              category={item.category}
                              variant="style_reference"
                              selected={false}
                              selectionIndicator="none"
                            />
                          </motion.button>
                        )
                      })}
                    </div>
                    {!searchQuery.trim() && hasMore && (
                      <button
                        type="button"
                        onClick={handleShowMore}
                        disabled={isLoadingMore}
                        aria-label="Show more pieces"
                        className={`absolute right-2 top-1/2 z-20 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#38383D] bg-[#1E1E21]/90 text-[#F5F1E9] shadow-lg backdrop-blur transition-all hover:bg-[#252529] hover:text-[#E8C568] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C568] ${
                          isLoadingMore ? 'pointer-events-none opacity-50' : ''
                        }`}
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Hand tray - pieces the user has picked up for this step */}
                <div className="mt-4 flex min-h-[68px] items-center gap-2 rounded-2xl border border-[#38383D] bg-[#1E1E21] px-4 py-3">
                  <span className="shrink-0 text-xs text-[#B5B0A8]">Selected</span>
                  <div className="flex flex-1 flex-wrap gap-2">
                    {currentSelectedIds.size === 0 ? (
                      <span className="text-xs text-[#B5B0A8]/60">None selected yet</span>
                    ) : (
                      Array.from(currentSelectedIds).map((id, idx) => {
                        const item = itemsByCategory[currentCategory]?.find((i) => i.id === id)
                        const label = item?.display_name ?? id + ' - Loading details...'

                        return (
                          <motion.button
                            key={id}
                            id={idx === 0 ? 'hand-tray-first-item' : undefined}
                            layoutId={`card-${id}`}
                            // The queued save ref is read only when this click handler runs.
                            // eslint-disable-next-line react-hooks/refs
                            onClick={() => handleDeselectPiece(id)}
                            aria-label={`Remove ${label} from selected pieces`}
                            className="flex items-center gap-1.5 rounded-full border border-[#E8C568]/40 bg-[#E8C568]/10 px-3 py-1 text-xs font-medium text-[#E8C568] transition-colors hover:bg-[#E8C568]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C568]"
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

                <button
                  type="button"
                  id="clear-step-button"
                  onClick={clearCurrentStep}
                  className="mt-3 text-xs text-[#E8C568] underline underline-offset-4 hover:text-[#E8C568]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8C568]"
                >
                  {STYLE_SELECTION_COPY.emptySelection}
                </button>

              </motion.div>
            )}
          </AnimatePresence>
        </div>

      </div>

      {submitError && (
        <div className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-4 right-4 z-50 mx-auto max-w-4xl rounded-xl border border-red-500/30 bg-red-950/90 px-4 py-3 text-sm text-red-100">
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
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#38383D] bg-[#141416]/95 px-6 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-4 backdrop-blur-lg">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="text-xs text-[#B5B0A8]">
            <span className="font-medium text-[#F5F1E9]">
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
                className="rounded-full px-4 py-2.5 text-xs font-semibold text-[#B5B0A8] hover:text-[#F5F1E9] transition-colors"
              >
                Back
              </button>
            )}

            <button
              type="button"
              onClick={handleNextStep}
              disabled={!isStepValid}
              className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-xs font-semibold transition-all ${isStepValid
                  ? 'bg-[#E8C568] text-[#171717] hover:bg-[#d9b85c] shadow-md'
                  : 'cursor-not-allowed border border-[#38383D] bg-[#1E1E21] text-[#B5B0A8]/40'
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
        {isFinalStep && <p className="mx-auto mt-2 max-w-4xl text-right text-xs text-[#B5B0A8]/60">Your selected pieces will be added to your wardrobe after calibration.</p>}
      </div>
    </div>
  )
}
