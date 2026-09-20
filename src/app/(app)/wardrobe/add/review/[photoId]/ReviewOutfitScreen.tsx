'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  confirmOutfitPhotoDraft, discardDraftItem, getOutfitPhotoReview,
  updateWardrobeItemAttributes, type OutfitPhotoReview,
} from '@/src/app/actions/wardrobe'
import { WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'

type Garment = OutfitPhotoReview['garments'][number]

function GarmentReviewCard({ item, onDone }: { item: Garment; onDone: () => Promise<void> }) {
  const [name, setName] = useState(item.displayName)
  const [category, setCategory] = useState(item.category ?? '')
  const [brand, setBrand] = useState(item.brand ?? '')
  const [color, setColor] = useState(item.color)
  const [useReconstructed, setUseReconstructed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const imageUrl = useReconstructed && item.reconstructedImageUrl
    ? item.reconstructedImageUrl : item.originalImageUrl
  async function add() {
    if (!name.trim() || !category) { setError('Add a name and category first.'); return }
    setBusy(true); setError(null)
    try {
      await updateWardrobeItemAttributes(item.id, {
        display_name: name.trim(), category, brand: brand.trim() || null,
        color: { primary: color.trim() || 'Unknown' },
      })
      await confirmOutfitPhotoDraft(item.id, useReconstructed)
      await onDone()
    } catch { setError('Could not add this piece. Please try again.') }
    finally { setBusy(false) }
  }
  async function skip() {
    setBusy(true); setError(null)
    try { await discardDraftItem(item.id); await onDone() }
    catch { setError('Could not skip this piece. Please try again.') }
    finally { setBusy(false) }
  }
  return <article className="overflow-hidden rounded-2xl border border-[#d8cec2] bg-[#fffdfa] shadow-sm">
    <div className="grid gap-4 p-4 sm:grid-cols-[150px_1fr]">
      <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-[#e9e4dd] sm:aspect-auto sm:min-h-48">
        <Image src={imageUrl} alt={name || 'Extracted garment'} fill unoptimized sizes="150px" className="object-contain" />
      </div>
      <div className="space-y-3">
        <label className="block text-xs font-medium text-[#6d6257]">Name
          <input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2 text-sm text-[#1d1b18]" />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-[#6d6257]">Category
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-2 py-2 text-sm text-[#1d1b18]">
              <option value="">Choose</option>{WARDROBE_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-xs font-medium text-[#6d6257]">Color
            <input value={color} onChange={(event) => setColor(event.target.value)} maxLength={80} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2 text-sm text-[#1d1b18]" />
          </label>
        </div>
        <label className="block text-xs font-medium text-[#6d6257]">Brand (optional)
          <input value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={80} placeholder="Add brand" className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2 text-sm text-[#1d1b18]" />
        </label>
        {item.reconstructedImageUrl && <button type="button" onClick={() => setUseReconstructed(!useReconstructed)} className="inline-flex items-center gap-2 text-xs font-medium text-[#635c52] underline underline-offset-4">
          <RotateCcw className="size-3" />{useReconstructed ? 'Show original crop' : 'Compare reconstructed view'}
        </button>}
      </div>
    </div>
    <div className="flex items-center justify-end gap-2 border-t border-[#e8e1d8] px-4 py-3">
      <Button type="button" variant="outline" size="sm" onClick={skip} disabled={busy}><X className="size-4" /> Skip</Button>
      <Button type="button" size="sm" onClick={add} disabled={busy}><Check className="size-4" /> {busy ? 'Saving...' : 'Add to closet'}</Button>
    </div>
    {error && <p role="alert" className="px-4 pb-3 text-xs text-red-700">{error}</p>}
  </article>
}

export default function ReviewOutfitScreen({ initial }: { initial: OutfitPhotoReview }) {
  const [review, setReview] = useState(initial)
  const [pollError, setPollError] = useState(false)
  const [handledCount, setHandledCount] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const waiting = review.status === 'uploading' || review.status === 'detecting'
  const delayed = waiting && now - new Date(review.startedAt).getTime() > 3 * 60 * 1000
  const refresh = useCallback(async () => {
    try { setReview(await getOutfitPhotoReview(initial.sourcePhotoId)); setPollError(false) }
    catch { setPollError(true) }
  }, [initial.sourcePhotoId])
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh() }, waiting ? 3000 : 240000)
    return () => window.clearInterval(timer)
  }, [waiting, refresh])
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [waiting])
  return <main className="min-h-screen bg-[#f7f4ef] px-4 py-7 text-[#1d1b18] sm:px-6"><div className="mx-auto max-w-3xl">
    <Link href="/wardrobe" aria-label="Back to wardrobe" className="mb-8 inline-flex size-10 items-center justify-center rounded-full border border-[#d8cec2] bg-white/60"><ArrowLeft className="size-4" /></Link>
    <p className="text-sm uppercase tracking-[0.18em] text-[#7a6f62]">Outfit photo</p>
    <h1 className="mt-2 text-3xl font-semibold">Review your pieces</h1>
    <p className="mt-3 max-w-xl text-sm text-[#6d6257]">Only the pieces you add will enter your closet. The original crop stays available even when a reconstructed view is shown.</p>
    <div className="mt-6 flex items-center gap-4 rounded-2xl bg-[#ebe3d8] p-3"><div className="relative size-24 shrink-0 overflow-hidden rounded-xl bg-white"><Image src={review.sourceImageUrl} alt="Uploaded outfit" fill unoptimized sizes="96px" className="object-cover" /></div><div><p className="font-medium">Your uploaded outfit</p><p className="mt-1 text-sm text-[#6d6257]">{waiting ? 'Separating visible garments…' : review.status === 'failed' ? 'Processing paused' : 'Ready to review'}</p></div></div>
    {waiting && <div role="status" className="mt-8 rounded-2xl border border-[#d8cec2] bg-white/70 p-6">{!delayed && <LoaderCircle className="size-6 animate-spin text-[#7a6f62]" />}<p className="mt-4 font-medium">{delayed ? 'Processing is taking longer than expected' : 'Finding the pieces in your photo'}</p><p className="mt-1 text-sm text-[#6d6257]">{delayed ? 'You can leave this page and check the photo again from your wardrobe. If the inference service is offline, processing will resume when it is available.' : 'This can take a few minutes. You can leave this page and return from your wardrobe.'}</p></div>}
    {review.status === 'failed' && <div role="alert" className="mt-8 rounded-2xl border border-[#d8cec2] bg-white/70 p-6"><p className="font-medium">We couldn’t finish this photo.</p><p className="mt-1 text-sm text-[#6d6257]">Your source photo remains private. Try a new photo or use the single-piece upload while processing is unavailable.</p><Link href="/wardrobe/add" className="mt-4 inline-block text-sm underline">Upload another photo</Link></div>}
    {pollError && <p role="status" className="mt-4 text-sm text-[#6d6257]">Connection interrupted. We’ll keep checking for your results.</p>}
    {review.status === 'done' && review.garments.length === 0 && <div className="mt-8 rounded-2xl border border-[#d8cec2] bg-white/70 p-6"><p className="font-medium">{review.detectedCount || handledCount ? 'All pieces reviewed' : 'No clear garments were found'}</p><Link href="/wardrobe" className="mt-4 inline-block text-sm underline">Back to wardrobe</Link></div>}
    {review.garments.length > 0 && <section className="mt-8 space-y-4" aria-label="Separated garments">{review.garments.map((item) => <GarmentReviewCard key={item.id} item={item} onDone={async () => { setHandledCount((count) => count + 1); await refresh() }} />)}</section>}
  </div></main>
}
