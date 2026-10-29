'use client'

import { useEffect, useState, useTransition } from 'react'
import {
  Bookmark,
  Calendar,
  Check,
  Loader2,
  MoreVertical,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import OutfitCanvas from '@/src/components/outfit/OutfitCanvas'
import type {
  PaginatedResult,
  ProfileOutfitLook,
  SavedLookEntry,
  WornLookEntry,
  ProfileAccount,
  ProfileCounts,
  ProfileStylePassport,
  SignatureLookData,
} from '@/src/lib/profile/types'
import {
  extractOutfitGarments,
  profileGarmentsToWardrobeItems,
} from '@/src/lib/profile/adapters'
import ProfileHeader from '@/src/components/profile/ProfileHeader'
import ProfileStats from '@/src/components/profile/ProfileStats'
import OutfitDetailsDialog from '@/src/components/profile/OutfitDetailsDialog'
import {
  changeWearDate,
  getSavedLooks,
  getWornLooksHistory,
  undoWear,
  unsaveOutfitLook,
} from '@/src/app/actions/profile'
import {
  formatProfileCalendarDate,
  formatProfileTimestamp,
} from '@/src/lib/profile/dates'

interface ProfileStudioClientProps {
  initialSaved: PaginatedResult<SavedLookEntry>
  initialWorn: PaginatedResult<WornLookEntry>
  account?: ProfileAccount
  counts?: ProfileCounts
  passport?: ProfileStylePassport
  signatureLook?: SignatureLookData | null
  initialTab?: 'saved' | 'worn'
}

export default function ProfileStudioClient({
  initialSaved,
  initialWorn,
  account,
  counts,
  passport,
  initialTab = 'saved',
}: ProfileStudioClientProps) {
  const [activeTab, setActiveTab] = useState<'saved' | 'worn'>(initialTab)

  // Detail dialog state
  const [selectedDetailOutfit, setSelectedDetailOutfit] = useState<ProfileOutfitLook | null>(null)

  // Active secondary actions menu state
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)

  // Close active dropdown menu on outside click or Escape with bulletproof Node checks
  useEffect(() => {
    function handleDocClick(e: MouseEvent) {
      if (
        e.target &&
        e.target instanceof Node &&
        !(e.target as HTMLElement).closest?.('[data-actions-menu]')
      ) {
        setActiveMenuId(null)
      }
    }
    function handleDocKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setActiveMenuId(null)
    }

    if (activeMenuId) {
      document.addEventListener('click', handleDocClick)
      document.addEventListener('keydown', handleDocKey)
      return () => {
        document.removeEventListener('click', handleDocClick)
        document.removeEventListener('keydown', handleDocKey)
      }
    }
  }, [activeMenuId])

  // Saved looks state
  const [savedEntries, setSavedEntries] = useState<SavedLookEntry[]>(initialSaved.items)
  const [savedCursor, setSavedCursor] = useState<string | null>(initialSaved.nextCursor)
  const [savedHasMore, setSavedHasMore] = useState<boolean>(initialSaved.hasMore)
  const [isLoadingMoreSaved, setIsLoadingMoreSaved] = useState<boolean>(false)

  // Worn history state
  const [wornEntries, setWornEntries] = useState<WornLookEntry[]>(initialWorn.items)
  const [wornCursor, setWornCursor] = useState<string | null>(initialWorn.nextCursor)
  const [wornHasMore, setWornHasMore] = useState<boolean>(initialWorn.hasMore)
  const [isLoadingMoreWorn, setIsLoadingMoreWorn] = useState<boolean>(false)

  // Inline date editing state
  const [editingWearRecordId, setEditingWearRecordId] = useState<string | null>(null)
  const [editedDateValue, setEditedDateValue] = useState<string>('')

  // Action status / banner notices
  const [pendingActionId, setPendingActionId] = useState<string | null>(null)
  const [statusNotice, setStatusNotice] = useState<{
    id: string
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const [, startTransition] = useTransition()

  // ---------------------------------------------------------------------------
  // Saved Looks Handlers
  // ---------------------------------------------------------------------------

  function handleUnsave(outfitId: string) {
    if (pendingActionId) return
    setActiveMenuId(null)
    setPendingActionId(outfitId)

    const previousSaved = savedEntries
    // Optimistic removal
    setSavedEntries((prev) => prev.filter((item) => item.outfitId !== outfitId))

    startTransition(async () => {
      try {
        await unsaveOutfitLook(outfitId)
        setStatusNotice({
          id: String(Date.now()),
          type: 'success',
          message: 'Look removed from your saved archive',
        })
      } catch (err) {
        // Rollback
        setSavedEntries(previousSaved)
        setStatusNotice({
          id: String(Date.now()),
          type: 'error',
          message: err instanceof Error ? err.message : 'Could not remove saved look',
        })
      } finally {
        setPendingActionId(null)
      }
    })
  }

  async function handleLoadMoreSaved() {
    if (!savedCursor || isLoadingMoreSaved) return
    setIsLoadingMoreSaved(true)
    try {
      const res = await getSavedLooks(savedCursor, 8)
      setSavedEntries((prev) => [...prev, ...res.items])
      setSavedCursor(res.nextCursor)
      setSavedHasMore(res.hasMore)
    } catch (err) {
      setStatusNotice({
        id: String(Date.now()),
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not load more saved looks',
      })
    } finally {
      setIsLoadingMoreSaved(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Worn History Handlers
  // ---------------------------------------------------------------------------

  function handleUndoWear(wearRecordId: string) {
    if (pendingActionId) return
    setActiveMenuId(null)
    setPendingActionId(wearRecordId)

    const previousWorn = wornEntries
    setWornEntries((prev) => prev.filter((item) => item.wearRecordId !== wearRecordId))

    startTransition(async () => {
      try {
        await undoWear(wearRecordId)
        setStatusNotice({
          id: String(Date.now()),
          type: 'success',
          message: 'Wear entry removed from history',
        })
      } catch (err) {
        setWornEntries(previousWorn)
        setStatusNotice({
          id: String(Date.now()),
          type: 'error',
          message: err instanceof Error ? err.message : 'Could not remove wear entry',
        })
      } finally {
        setPendingActionId(null)
      }
    })
  }

  function handleStartEditDate(entry: WornLookEntry) {
    setActiveMenuId(null)
    setEditingWearRecordId(entry.wearRecordId)
    setEditedDateValue(entry.wornOn)
  }

  function handleCancelEditDate() {
    setEditingWearRecordId(null)
    setEditedDateValue('')
  }

  function handleSubmitEditDate(wearRecordId: string) {
    if (!editedDateValue || pendingActionId) return
    setPendingActionId(wearRecordId)

    startTransition(async () => {
      try {
        const res = await changeWearDate(wearRecordId, editedDateValue)
        setWornEntries((prev) =>
          prev.map((item) =>
            item.wearRecordId === wearRecordId
              ? {
                  ...item,
                  wornOn: res.wornOn,
                  wornOnDisplay: formatProfileCalendarDate(res.wornOn),
                }
              : item,
          ),
        )
        setEditingWearRecordId(null)
        setStatusNotice({
          id: String(Date.now()),
          type: 'success',
          message: 'Wear date updated successfully',
        })
      } catch (err) {
        setStatusNotice({
          id: String(Date.now()),
          type: 'error',
          message: err instanceof Error ? err.message : 'Could not change wear date',
        })
      } finally {
        setPendingActionId(null)
      }
    })
  }

  async function handleLoadMoreWorn() {
    if (!wornCursor || isLoadingMoreWorn) return
    setIsLoadingMoreWorn(true)
    try {
      const res = await getWornLooksHistory(wornCursor, 8)
      setWornEntries((prev) => [...prev, ...res.items])
      setWornCursor(res.nextCursor)
      setWornHasMore(res.hasMore)
    } catch (err) {
      setStatusNotice({
        id: String(Date.now()),
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not load more wear history',
      })
    } finally {
      setIsLoadingMoreWorn(false)
    }
  }

  const fallbackAccount: ProfileAccount = {
    id: 'user',
    email: null,
    displayName: 'Member',
    initials: 'M',
    avatarUrl: null,
  }

  const fallbackCounts: ProfileCounts = {
    wardrobePieces: null,
    savedLooks: null,
    timesWorn: null,
  }

  const fallbackPassport: ProfileStylePassport = {
    topStyles: [],
    quizSignals: null,
    hasStyleData: false,
    caption: 'Based on your style choices.',
  }

  return (
    <main className="px-4 py-7 text-[#1D1B18] sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-6xl">
        {/* 1. Profile Header matching Wardrobe layout with single account trigger */}
        <ProfileHeader
          account={account ?? fallbackAccount}
          counts={counts ?? fallbackCounts}
          passport={passport ?? fallbackPassport}
        />

        {/* 2. Inline Summary Statistics bar */}
        <ProfileStats counts={counts ?? fallbackCounts} />

        {/* Notice Alert Banner */}
        {statusNotice && (
          <div
            role="status"
            className={`mb-6 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-xs sm:text-sm font-medium transition-all ${
              statusNotice.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
            }`}
          >
            <span>{statusNotice.message}</span>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-xs underline hover:no-underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 3. Lookbook Section Heading & Tabs matching screenshot */}
        <div id="lookbook-archive-section" className="mb-3">
          <h2 className="text-xl font-semibold tracking-tight text-[#1D1B18]">
            Your looks
          </h2>
        </div>

        <nav aria-label="Profile views" className="mb-6 flex gap-6 border-b border-[#EBE3D8] text-sm">
          <button
            type="button"
            role="tab"
            id="tab-saved"
            aria-selected={activeTab === 'saved'}
            aria-controls="panel-saved"
            onClick={() => setActiveTab('saved')}
            className={`pb-2.5 text-sm font-medium transition-colors ${
              activeTab === 'saved'
                ? 'border-b-2 border-[#1D1B18] text-[#1D1B18]'
                : 'border-b-2 border-transparent text-[#6D6257] hover:text-[#1D1B18]'
            }`}
          >
            Saved
          </button>

          <button
            type="button"
            role="tab"
            id="tab-worn"
            aria-selected={activeTab === 'worn'}
            aria-controls="panel-worn"
            onClick={() => setActiveTab('worn')}
            className={`pb-2.5 text-sm font-medium transition-colors ${
              activeTab === 'worn'
                ? 'border-b-2 border-[#1D1B18] text-[#1D1B18]'
                : 'border-b-2 border-transparent text-[#6D6257] hover:text-[#1D1B18]'
            }`}
          >
            Worn
          </button>
        </nav>

        {/* 4. Tab Panels */}
        {activeTab === 'saved' ? (
          <section id="panel-saved" role="tabpanel" aria-labelledby="tab-saved">
            {savedEntries.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#D8CEC2] bg-[#EBE3D8]/30 py-16 px-4 text-center">
                <Bookmark className="mx-auto size-7 text-[#6D6257] opacity-60" />
                <h3 className="mt-3 text-base font-medium text-[#1D1B18]">
                  No saved looks yet
                </h3>
                <p className="mt-1.5 text-xs max-w-sm mx-auto text-[#6D6257]">
                  Save recommendations from Today or worn history to keep your favorite combinations at hand.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Responsive Grid matching screenshot */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
                  {savedEntries.map((entry) => {
                    const outfit = entry.outfit
                    const garments = extractOutfitGarments(outfit)
                    const identity =
                      garments
                        .map((i) => i.displayName)
                        .filter(Boolean)
                        .join(' · ') || 'Saved look'

                    const isActionPending = pendingActionId === entry.outfitId
                    const isMenuOpen = activeMenuId === entry.outfitId
                    const displaySavedDate =
                      entry.savedAtDisplay ?? formatProfileTimestamp(entry.savedAt)

                    return (
                      <div
                        key={entry.outfitId}
                        className="group relative flex flex-col justify-between overflow-visible rounded-2xl border border-[#E5DFD7] bg-[#FFFDFA] transition-all hover:shadow-xs"
                      >
                        {/* Image area with top-right actions button */}
                        <div className="relative aspect-4/5 w-full overflow-hidden rounded-t-2xl bg-[#F5EFEB] p-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDetailOutfit(outfit)}
                            className="relative flex size-full items-center justify-center rounded-xl overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D1B18]"
                            aria-label={`View details for ${identity}`}
                          >
                            <OutfitCanvas
                              items={profileGarmentsToWardrobeItems(garments)}
                              identity={identity}
                              variant="thumbnail"
                              className="size-full"
                            />
                          </button>

                          {/* Top-Right Actions Menu */}
                          <div className="absolute top-2 right-2 z-20" data-actions-menu>
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              aria-label={`Actions for ${identity}`}
                              onClick={() => setActiveMenuId(isMenuOpen ? null : entry.outfitId)}
                              className="flex size-7 items-center justify-center rounded-full text-[#6D6257] transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[#1D1B18]"
                            >
                              {isActionPending ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <MoreVertical className="size-4" />
                              )}
                            </button>

                            <div
                              role="menu"
                              aria-label={`Options for ${identity}`}
                              className={`absolute right-0 top-full mt-1 z-30 w-44 rounded-2xl border border-[#D8CEC2] bg-[#FFFDFA] p-1.5 shadow-xl text-xs text-[#1D1B18] ${
                                isMenuOpen ? 'block' : 'hidden'
                              }`}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => handleUnsave(entry.outfitId)}
                                disabled={isActionPending}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-[#1D1B18]"
                              >
                                <Trash2 className="size-3.5" />
                                <span>Unsave</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Bar: Title & Saved Date matching design */}
                        <div className="p-3 border-t border-[#EAE3DA]">
                          <p
                            className="truncate text-sm font-medium text-[#1D1B18]"
                            title={identity}
                          >
                            {identity}
                          </p>
                          <p className="truncate text-xs text-[#6D6257] mt-0.5">
                            Saved {displaySavedDate}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Load More Button */}
                {savedHasMore && (
                  <div className="pt-2 text-center">
                    <Button
                      variant="outline"
                      disabled={isLoadingMoreSaved}
                      onClick={handleLoadMoreSaved}
                      className="min-h-11 rounded-full border-[#D8CEC2] bg-[#FFFDFA] px-6 text-xs font-medium text-[#1D1B18] hover:bg-[#EBE3D8]/50"
                    >
                      {isLoadingMoreSaved ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>Loading more…</span>
                        </>
                      ) : (
                        <span>Load older saved looks</span>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section id="panel-worn" role="tabpanel" aria-labelledby="tab-worn">
            {wornEntries.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-[#D8CEC2] bg-[#EBE3D8]/30 py-16 px-4 text-center">
                <Calendar className="mx-auto size-7 text-[#6D6257] opacity-60" />
                <h3 className="mt-3 text-base font-medium text-[#1D1B18]">
                  No wear history yet
                </h3>
                <p className="mt-1.5 text-xs max-w-sm mx-auto text-[#6D6257]">
                  Wear decisions logged from your daily recommendation or lookbook will appear here in chronological order.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Responsive Compact Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 sm:gap-4">
                  {wornEntries.map((entry) => {
                    const outfit = entry.outfit
                    const garments = extractOutfitGarments(outfit)
                    const identity =
                      garments
                        .map((i) => i.displayName)
                        .filter(Boolean)
                        .join(' · ') || 'Worn look'

                    const isActionPending = pendingActionId === entry.wearRecordId
                    const isMenuOpen = activeMenuId === entry.wearRecordId
                    const isEditingThisDate = editingWearRecordId === entry.wearRecordId
                    const displayWornDate =
                      entry.wornOnDisplay ?? formatProfileCalendarDate(entry.wornOn)

                    return (
                      <div
                        key={entry.wearRecordId}
                        className="group relative flex flex-col justify-between overflow-visible rounded-2xl border border-[#E5DFD7] bg-[#FFFDFA] transition-all hover:shadow-xs"
                      >
                        {/* Image area with top-right actions button */}
                        <div className="relative aspect-4/5 w-full overflow-hidden rounded-t-2xl bg-[#F5EFEB] p-2">
                          <button
                            type="button"
                            onClick={() => setSelectedDetailOutfit(outfit)}
                            className="relative flex size-full items-center justify-center rounded-xl overflow-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D1B18]"
                            aria-label={`View details for ${identity}`}
                          >
                            <OutfitCanvas
                              items={profileGarmentsToWardrobeItems(garments)}
                              identity={identity}
                              variant="thumbnail"
                              className="size-full"
                            />
                          </button>

                          {/* Top-Right Actions Menu */}
                          <div className="absolute top-2 right-2 z-20" data-actions-menu>
                            <button
                              type="button"
                              aria-haspopup="menu"
                              aria-expanded={isMenuOpen}
                              aria-label={`Actions for ${identity}`}
                              onClick={() =>
                                setActiveMenuId(isMenuOpen ? null : entry.wearRecordId)
                              }
                              className="flex size-7 items-center justify-center rounded-full text-[#6D6257] transition-colors hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-[#1D1B18]"
                            >
                              {isActionPending ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <MoreVertical className="size-4" />
                              )}
                            </button>

                            <div
                              role="menu"
                              aria-label={`Options for ${identity}`}
                              className={`absolute right-0 top-full mt-1 z-30 w-44 rounded-2xl border border-[#D8CEC2] bg-[#FFFDFA] p-1.5 shadow-xl text-xs text-[#1D1B18] ${
                                isMenuOpen ? 'block' : 'hidden'
                              }`}
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => handleStartEditDate(entry)}
                                disabled={isActionPending}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-[#1D1B18] transition-colors hover:bg-[#EBE3D8]/50 focus-visible:outline-2 focus-visible:outline-[#1D1B18]"
                              >
                                <RotateCcw className="size-3.5" />
                                <span>Change wear date</span>
                              </button>

                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => handleUndoWear(entry.wearRecordId)}
                                disabled={isActionPending}
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-[#1D1B18]"
                              >
                                <Trash2 className="size-3.5" />
                                <span>Undo wear</span>
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Bottom Bar: Title & Worn Date */}
                        <div className="p-3 border-t border-[#EAE3DA]">
                          <p
                            className="truncate text-sm font-medium text-[#1D1B18]"
                            title={identity}
                          >
                            {identity}
                          </p>
                          <p className="truncate text-xs text-[#6D6257] mt-0.5">
                            Worn {displayWornDate}
                          </p>
                        </div>

                        {/* Inline Date Editor Overlay */}
                        {isEditingThisDate && (
                          <div
                            role="dialog"
                            aria-labelledby={`date-editor-title-${entry.wearRecordId}`}
                            className="absolute inset-0 z-40 flex flex-col justify-between rounded-2xl border border-[#D8CEC2] bg-[#FFFDFA] p-3 shadow-xl"
                          >
                            <div>
                              <p
                                id={`date-editor-title-${entry.wearRecordId}`}
                                className="text-[11px] font-semibold text-[#1D1B18]"
                              >
                                New wear date
                              </p>
                              <input
                                type="date"
                                aria-label="New wear date"
                                value={editedDateValue}
                                onChange={(e) => setEditedDateValue(e.target.value)}
                                className="mt-2 w-full rounded-xl border border-[#D8CEC2] bg-[#FFFDFA] px-2 py-1.5 text-xs text-[#1D1B18] focus-visible:outline-2 focus-visible:outline-[#1D1B18]"
                              />
                            </div>

                            <div className="mt-3 flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={handleCancelEditDate}
                                className="h-8 rounded-lg px-2 text-[11px] text-[#6D6257]"
                              >
                                Cancel
                              </Button>
                              <Button
                                size="sm"
                                disabled={isActionPending || !editedDateValue}
                                onClick={() => handleSubmitEditDate(entry.wearRecordId)}
                                className="h-8 rounded-lg bg-[#1D1B18] px-2.5 text-[11px] text-[#FFFDFA] hover:bg-[#1D1B18]/90"
                              >
                                {isActionPending ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Check className="size-3" />
                                )}
                                <span>Save</span>
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Load More Button */}
                {wornHasMore && (
                  <div className="pt-2 text-center">
                    <Button
                      variant="outline"
                      disabled={isLoadingMoreWorn}
                      onClick={handleLoadMoreWorn}
                      className="min-h-11 rounded-full border-[#D8CEC2] bg-[#FFFDFA] px-6 text-xs font-medium text-[#1D1B18] hover:bg-[#EBE3D8]/50"
                    >
                      {isLoadingMoreWorn ? (
                        <>
                          <Loader2 className="size-3.5 animate-spin" />
                          <span>Loading more…</span>
                        </>
                      ) : (
                        <span>Load older wear history</span>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 5. Accessible Garment Breakdown Dialog */}
        {selectedDetailOutfit && (
          <OutfitDetailsDialog
            isOpen={Boolean(selectedDetailOutfit)}
            outfit={selectedDetailOutfit}
            onClose={() => setSelectedDetailOutfit(null)}
          />
        )}
      </div>
    </main>
  )
}
