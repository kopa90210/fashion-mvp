'use client'

import Image from 'next/image'
import { useEffect, useReducer, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import FlatLay from '@/src/components/outfit/FlatLay'
import type { DailyOutfit } from '@/src/app/actions/outfit'
import { createSwappedOutfit, getSwapCandidates, type SwapCandidate } from '@/src/app/actions/outfit-swaps'
import type { WardrobeItem } from '@/src/lib/outfit/engine'

export type SwapStage = 'select' | 'candidates' | 'preview'
export type SwapState = {
  open: boolean
  stage: SwapStage
  selected: WardrobeItem | null
  candidates: SwapCandidate[]
  preview: SwapCandidate | null
  loading: boolean
  saving: boolean
  loadError: boolean
  saveError: boolean
}
export type SwapAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'select'; item: WardrobeItem }
  | { type: 'loaded'; candidates: SwapCandidate[] }
  | { type: 'load_failed' }
  | { type: 'retry' }
  | { type: 'preview'; candidate: SwapCandidate }
  | { type: 'choose_another' }
  | { type: 'save_started' }
  | { type: 'save_failed' }

export const initialSwapState: SwapState = {
  open: false, stage: 'select', selected: null, candidates: [], preview: null,
  loading: false, saving: false, loadError: false, saveError: false,
}

export function swapReducer(_state: SwapState, action: SwapAction): SwapState {
  switch (action.type) {
    case 'open': return { ...initialSwapState, open: true }
    case 'close': return initialSwapState
    case 'select': return { ...initialSwapState, open: true, stage: 'candidates', selected: action.item, loading: true }
    case 'loaded': return { ..._state, candidates: action.candidates, loading: false, loadError: false }
    case 'load_failed': return { ..._state, candidates: [], loading: false, loadError: true }
    case 'retry': return { ..._state, loading: true, loadError: false }
    case 'preview': return { ..._state, stage: 'preview', preview: action.candidate, saveError: false }
    case 'choose_another': return { ..._state, stage: 'candidates', preview: null, saveError: false }
    case 'save_started': return { ..._state, saving: true, saveError: false }
    case 'save_failed': return { ..._state, saving: false, saveError: true }
  }
}

const roleTitle: Record<string, string> = {
  base_layer: 'Swap shirt', bottom: 'Swap bottoms', footwear: 'Swap shoes',
  outerwear: 'Swap layer', accessory: 'Swap accessory',
}

export function swapPreviewItems(items: WardrobeItem[], selectedId: string, replacement: WardrobeItem) {
  return items.map((item) => item.id === selectedId ? replacement : item)
}

export function derivedSwappedOutfit(parent: DailyOutfit, outfitId: string, items: WardrobeItem[], score: number): DailyOutfit {
  return { ...parent, id: outfitId, items, score, reasons: [] }
}

export function swapIdempotencyKey(parentId: string, selectedId: string, replacementId: string) {
  return `today:swap:${parentId}:${selectedId}:${replacementId}`
}

export async function commitSwap(parentId: string, selectedId: string, replacementId: string) {
  return createSwappedOutfit(parentId, selectedId, replacementId, swapIdempotencyKey(parentId, selectedId, replacementId))
}

export async function fetchSwapCandidates(parentId: string, selectedId: string) {
  return getSwapCandidates(parentId, selectedId, 3)
}

function PieceImage({ item, sizes = '40vw' }: { item: WardrobeItem; sizes?: string }) {
  return <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#EBE3D8]">
    {item.image_url ? <Image src={item.image_url} alt={item.display_name} fill unoptimized sizes={sizes} className="object-contain p-4" />
      : <div className="flex h-full items-center justify-center px-3 text-center text-xs text-[#6D6257]">Photo unavailable</div>}
  </div>
}

export function SwapPanel({ state, outfit, headingRef, onSelect, onRetry, onPreview, onChooseAnother, onConfirm }: {
  state: SwapState
  outfit: DailyOutfit
  headingRef?: React.RefObject<HTMLHeadingElement | null>
  onSelect: (item: WardrobeItem) => void
  onRetry: () => void
  onPreview: (candidate: SwapCandidate) => void
  onChooseAnother: () => void
  onConfirm: () => void
}) {
  if (state.stage === 'select') {
    const main = outfit.items.filter((item) => item.layer_role !== 'accessory')
    const accessories = outfit.items.filter((item) => item.layer_role === 'accessory')
    return <div>
      <h2 ref={headingRef} tabIndex={-1} id="swap-title" className="text-2xl font-medium outline-none">What would you change?</h2>
      <p className="mt-2 text-sm text-[#6D6257]">Choose one piece from this look.</p>
      <div className="mt-6 grid grid-cols-2 gap-4">{main.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)} aria-label={`Swap ${item.display_name}`} className="rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#6D6257]"><PieceImage item={item} /><span className="mt-2 block truncate text-sm">{item.display_name}</span></button>)}</div>
      {accessories.length > 0 && <section className="mt-7 border-t border-[#D8CEC2] pt-5" aria-labelledby="swap-accessories"><h3 id="swap-accessories" className="text-sm font-medium text-[#6D6257]">Accessories</h3><div className="mt-3 space-y-2">{accessories.map((item) => <button key={item.id} type="button" onClick={() => onSelect(item)} aria-label={`Swap ${item.display_name}`} className="flex min-h-14 w-full items-center gap-3 rounded-xl px-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-[#6D6257]"><span className="relative size-12 overflow-hidden rounded-xl bg-[#EBE3D8]">{item.image_url && <Image src={item.image_url} alt="" fill unoptimized sizes="48px" className="object-contain p-1" />}</span><span className="text-sm">{item.display_name}</span></button>)}</div></section>}
    </div>
  }

  if (state.stage === 'candidates' && state.selected) {
    return <div>
      <h2 ref={headingRef} tabIndex={-1} id="swap-title" className="text-2xl font-medium outline-none">{roleTitle[state.selected.layer_role] ?? 'Swap piece'}</h2>
      <p className="mt-5 text-xs uppercase tracking-[0.16em] text-[#6D6257]">Current piece</p>
      <div className="mt-3 grid grid-cols-[84px_1fr] items-center gap-4"><PieceImage item={state.selected} sizes="84px" /><p className="font-medium">{state.selected.display_name}</p></div>
      <h3 className="mt-8 text-lg font-medium">Try instead</h3>
      {state.loading && <div role="status" aria-label="Loading alternatives" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{[0, 1, 2].map((key) => <div key={key}><Skeleton className="aspect-[4/5] rounded-2xl" /><Skeleton className="mt-3 h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" /></div>)}</div>}
      {state.loadError && <div role="alert" className="mt-6"><p>Couldn&apos;t load alternatives. Try again.</p><Button type="button" variant="outline" onClick={onRetry} className="mt-4 h-11 rounded-full px-6">Try again</Button></div>}
      {!state.loading && !state.loadError && state.candidates.length === 0 && <div className="mt-6"><p className="text-[#6D6257]">No alternatives for this piece yet.</p><Button type="button" variant="outline" onClick={onChooseAnother} className="mt-4 h-11 rounded-full px-6">Choose another piece</Button></div>}
      {!state.loading && !state.loadError && state.candidates.length > 0 && <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">{state.candidates.map((candidate) => <button key={candidate.replacement.id} type="button" onClick={() => onPreview(candidate)} aria-label={`Preview ${candidate.replacement.display_name} instead of ${state.selected!.display_name}`} className="rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-[#6D6257]"><PieceImage item={candidate.replacement} /><span className="mt-3 block truncate text-sm font-medium">{candidate.replacement.display_name}</span><span className="mt-1 block text-xs leading-5 text-[#6D6257]">{candidate.descriptor}</span></button>)}</div>}
    </div>
  }

  if (!state.selected || !state.preview) return null
  const previewItems = swapPreviewItems(outfit.items, state.selected.id, state.preview.replacement)
  return <div>
    <h2 ref={headingRef} tabIndex={-1} id="swap-title" className="text-2xl font-medium outline-none">Updated look</h2>
    <div className="mx-auto mt-5 max-w-sm"><FlatLay items={previewItems} editorial /></div>
    <div className="mt-6 space-y-3"><Button type="button" onClick={onConfirm} disabled={state.saving} className="h-12 w-full rounded-full bg-[#1D1B18] text-[#FFFDFA]">{state.saving ? 'Saving look…' : 'Use this look'}</Button><Button type="button" variant="outline" onClick={onChooseAnother} disabled={state.saving} className="h-12 w-full rounded-full border-[#D8CEC2] bg-[#FFFDFA]">Choose another</Button></div>
    {state.saveError && <p role="alert" className="mt-4 text-sm text-red-700">Couldn&apos;t save this look. Try again.</p>}
  </div>
}

export default function SwapOutfitFlow({ outfit, onApplied }: {
  outfit: DailyOutfit
  onApplied: (outfit: DailyOutfit) => void
}) {
  const [state, dispatch] = useReducer(swapReducer, initialSwapState)
  const dialog = useRef<HTMLDialogElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const wasOpen = useRef(false)
  const loadRequest = useRef(0)
  const saveLock = useRef(false)

  useEffect(() => {
    if (state.open) {
      if (!dialog.current?.open) dialog.current?.showModal()
    } else {
      if (dialog.current?.open) dialog.current.close()
      if (wasOpen.current) trigger.current?.focus()
    }
    wasOpen.current = state.open
  }, [state.open])
  useEffect(() => { if (state.open) heading.current?.focus() }, [state.open, state.stage, state.loading])

  async function load(item: WardrobeItem, retry = false) {
    const request = ++loadRequest.current
    dispatch(retry ? { type: 'retry' } : { type: 'select', item })
    try {
      const candidates = await fetchSwapCandidates(outfit.id, item.id)
      if (request === loadRequest.current) dispatch({ type: 'loaded', candidates })
    } catch {
      if (request === loadRequest.current) dispatch({ type: 'load_failed' })
    }
  }

  async function confirm() {
    if (!state.selected || !state.preview || saveLock.current) return
    saveLock.current = true
    dispatch({ type: 'save_started' })
    try {
      const result = await commitSwap(outfit.id, state.selected.id, state.preview.replacement.id)
      const items = swapPreviewItems(outfit.items, state.selected.id, state.preview.replacement)
      onApplied(derivedSwappedOutfit(outfit, result.outfitId, items, state.preview.outfitScore))
      dispatch({ type: 'close' })
    } catch {
      dispatch({ type: 'save_failed' })
    } finally {
      saveLock.current = false
    }
  }

  function close() {
    if (state.saving) return
    ++loadRequest.current
    dispatch({ type: 'close' })
  }

  return <>
    <Button ref={trigger} type="button" variant="outline" onClick={() => dispatch({ type: 'open' })} className="mt-3 h-11 w-full rounded-full border-[#D8CEC2] bg-[#FFFDFA]">Swap something</Button>
    <dialog ref={dialog} onCancel={(event) => { if (state.saving) event.preventDefault(); else close() }} onClose={close} aria-labelledby="swap-title" className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-[#FFFDFA] p-6 text-[#1D1B18] backdrop:bg-black/35 sm:inset-0 sm:m-auto sm:max-w-2xl sm:rounded-3xl sm:p-8">
      <button type="button" onClick={close} disabled={state.saving} aria-label="Close swap" className="absolute right-4 top-4 z-10 flex size-11 items-center justify-center rounded-full bg-[#FFFDFA] outline-none focus-visible:ring-2 focus-visible:ring-[#6D6257]"><X aria-hidden="true" className="size-5" /></button>
      <div className="pr-10"><SwapPanel state={state} outfit={outfit} headingRef={heading} onSelect={(item) => { void load(item) }} onRetry={() => { if (state.selected) void load(state.selected, true) }} onPreview={(candidate) => dispatch({ type: 'preview', candidate })} onChooseAnother={() => dispatch(state.stage === 'preview' ? { type: 'choose_another' } : { type: 'open' })} onConfirm={() => { void confirm() }} /></div>
    </dialog>
  </>
}
