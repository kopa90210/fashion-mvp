'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmOutfitPhotoDraft, discardDraftItem, getOutfitPhotoReview, updateWardrobeItemAttributes, type OutfitPhotoReview } from '@/src/app/actions/wardrobe'
import { WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'
import { processingMessage, reviewPieces, type ReviewGarment } from './review-flow'

const field = 'mt-2 w-full rounded-xl border border-[#D8CEC2] bg-[#FFFDFA] px-3 py-3 text-base text-[#1D1B18]'
const categoryName = (category: string | null) => category ? category.charAt(0).toUpperCase() + category.slice(1) : 'Choose a category'

function FocusedPiece({ item, onHandled, onEdited }: {
  item: ReviewGarment
  onHandled: (id: string) => void
  onEdited: (item: ReviewGarment) => void
}) {
  const [alternate, setAlternate] = useState(false)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(item.displayName)
  const [category, setCategory] = useState(item.category ?? '')
  const [subcategory, setSubcategory] = useState(item.subcategory ?? '')
  const [color, setColor] = useState(item.color)
  const [brand, setBrand] = useState(item.brand ?? '')
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (editing) dialog.current?.showModal()
    else dialog.current?.close()
  }, [editing])

  async function saveDetails() {
    if (!name.trim() || !WARDROBE_CATEGORIES.some((value) => value === category)) {
      setError('Please add a name and choose a category.'); return
    }
    setBusy(true); setError(null)
    try {
      await updateWardrobeItemAttributes(item.id, {
        display_name: name.trim(), category, subcategory: subcategory.trim() || null,
        color: { primary: color.trim() || 'Unknown' }, brand: brand.trim() || null,
      })
      setEditing(false)
      onEdited({ ...item, displayName: name.trim(), category, subcategory: subcategory.trim() || null, color: color.trim() || 'Unknown', brand: brand.trim() || null })
    } catch { setError('Could not save these details. Please try again.') }
    finally { setBusy(false) }
  }

  async function handle(add: boolean) {
    if (add && (!item.displayName.trim() || !WARDROBE_CATEGORIES.some((value) => value === item.category))) {
      setError('Add a name and category in Edit details before adding this piece.'); return
    }
    setBusy(true); setError(null)
    try {
      if (add) await confirmOutfitPhotoDraft(item.id, alternate && !!item.reconstructedImageUrl)
      else await discardDraftItem(item.id)
      onHandled(item.id)
    } catch { setError(add ? 'Could not add this piece. Please try again.' : 'Could not skip this piece. Please try again.') }
    finally { setBusy(false) }
  }

  function openEditor() {
    setName(item.displayName); setCategory(item.category ?? ''); setSubcategory(item.subcategory ?? '')
    setColor(item.color); setBrand(item.brand ?? ''); setError(null); setEditing(true)
  }

  return <article>
    <div className="relative aspect-[4/5] max-h-[52vh] overflow-hidden rounded-3xl bg-[#EBE3D8] sm:max-h-[560px]">
      <Image src={alternate && item.reconstructedImageUrl ? item.reconstructedImageUrl : item.originalImageUrl} alt={item.displayName || 'Clothing piece'} fill unoptimized sizes="(min-width: 768px) 520px, 100vw" className="object-contain p-8 sm:p-12" />
    </div>
    {item.reconstructedImageUrl && <button type="button" disabled={busy} aria-pressed={alternate} onClick={() => setAlternate(!alternate)} className="mt-3 min-h-10 text-sm text-[#6D6257] underline underline-offset-4">{alternate ? 'Show original photo' : 'See alternate view'}</button>}
    <h2 className="mt-6 text-2xl font-medium">{item.displayName || 'Your piece'}</h2>
    <p className="mt-2 text-sm text-[#6D6257]">{categoryName(item.category)}{item.color && item.color.toLowerCase() !== 'unknown' ? ` · ${item.color}` : ''}</p>
    <button type="button" onClick={openEditor} disabled={busy} className="mt-2 min-h-11 text-sm underline underline-offset-4">Edit details</button>
    <div className="mt-5 flex gap-3">
      <Button variant="outline" disabled={busy} onClick={() => void handle(false)} className="h-12 flex-1 rounded-full border-[#D8CEC2] bg-[#FFFDFA]">Skip</Button>
      <Button disabled={busy} onClick={() => void handle(true)} className="h-12 flex-[2] rounded-full bg-[#1D1B18] text-[#FFFDFA]">{busy ? 'Saving…' : 'Add to wardrobe'}</Button>
    </div>
    {error && !editing && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <dialog ref={dialog} onCancel={(event) => { if (busy) event.preventDefault(); else setEditing(false) }} onClose={() => setEditing(false)} aria-labelledby="details-title" className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-[#FFFDFA] p-6 text-[#1D1B18] backdrop:bg-black/35 sm:inset-0 sm:m-auto sm:max-w-lg sm:rounded-3xl">
      <div className="flex items-center justify-between"><h2 id="details-title" className="text-2xl">Edit details</h2><button type="button" disabled={busy} onClick={() => setEditing(false)} aria-label="Close details" className="flex size-11 items-center justify-center rounded-full"><X className="size-5" /></button></div>
      <form onSubmit={(event) => { event.preventDefault(); void saveDetails() }} className="mt-6 space-y-4">
        <label className="block text-sm">Name<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className={field} disabled={busy} /></label>
        <label className="block text-sm">Category<select required value={category} onChange={(event) => setCategory(event.target.value)} className={field} disabled={busy}><option value="">Choose category</option>{WARDROBE_CATEGORIES.map((value) => <option key={value} value={value}>{categoryName(value)}</option>)}</select></label>
        <label className="block text-sm">Subcategory<input maxLength={120} value={subcategory} onChange={(event) => setSubcategory(event.target.value)} className={field} disabled={busy} /></label>
        <label className="block text-sm">Color<input maxLength={80} value={color} onChange={(event) => setColor(event.target.value)} className={field} disabled={busy} /></label>
        <label className="block text-sm">Brand (optional)<input maxLength={80} value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Add brand" className={field} disabled={busy} /></label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <Button type="submit" disabled={busy} className="h-12 w-full rounded-full">{busy ? 'Saving…' : 'Save details'}</Button>
      </form>
    </dialog>
  </article>
}

export default function ReviewOutfitScreen({ initial }: { initial: OutfitPhotoReview }) {
  const [review, setReview] = useState(initial)
  const [pollError, setPollError] = useState(false)
  const [handled, setHandled] = useState<string[]>([])
  const [accessories, setAccessories] = useState(false)
  const [finished, setFinished] = useState(false)
  const active = useRef(false)
  const request = useRef(0)
  const waiting = review.status === 'uploading' || review.status === 'detecting'
  const refresh = useCallback(async () => {
    const sequence = ++request.current
    try {
      const next = await getOutfitPhotoReview(initial.sourcePhotoId)
      if (active.current && sequence === request.current) { setReview(next); setPollError(false) }
    } catch { if (active.current && sequence === request.current) setPollError(true) }
  }, [initial.sourcePhotoId])
  useEffect(() => {
    active.current = true
    ++request.current
    const timer = window.setInterval(() => { void refresh() }, waiting ? 3000 : 240000)
    return () => { active.current = false; window.clearInterval(timer) }
  }, [waiting, refresh])
  const pieces = reviewPieces(review.garments, handled)
  const current = pieces.main[0] ?? (accessories ? pieces.accessories[0] : undefined)
  const total = Math.max(review.detectedCount, review.garments.length + handled.filter((id) => !review.garments.some((item) => item.id === id)).length)
  const remaining = pieces.main.length + pieces.accessories.length
  const complete = finished || (!remaining && total > 0 && (accessories || handled.length === 0))
  const ready = review.status === 'done'

  return <main className="min-h-screen bg-[#F7F4EF] px-5 py-6 text-[#1D1B18] sm:px-8 sm:py-10"><div className="mx-auto max-w-5xl">
    <Link href="/wardrobe" aria-label="Back to wardrobe" className="mb-7 inline-flex size-11 items-center justify-center rounded-full border border-[#D8CEC2]"><ArrowLeft className="size-5" /></Link>
    <p className="text-xs uppercase tracking-[0.2em] text-[#6D6257]">Your outfit</p>
    <h1 className="mt-3 text-3xl font-medium sm:text-4xl">{waiting ? processingMessage(review.jobStatus) : review.status === 'failed' ? 'Let’s try another photo' : complete ? 'Review complete' : `${total} ${total === 1 ? 'piece' : 'pieces'} found`}</h1>
    <p className="mt-3 text-sm leading-relaxed text-[#6D6257]">{waiting ? 'You can leave this page. Your pieces will be waiting here when they’re ready.' : 'Only the pieces you choose to add enter your wardrobe.'}</p>
    {pollError && <p role="status" className="mt-4 text-sm text-[#6D6257]">Connection interrupted. We’ll keep checking for your pieces.</p>}
    {waiting && <div role="status" className="mt-10 flex items-center gap-3 text-[#6D6257]"><LoaderCircle aria-hidden="true" className="size-5 animate-spin" /><span>Your photo is being prepared for review.</span></div>}
    {review.status === 'failed' && <div role="alert" className="mt-10"><p className="text-[#6D6257]">We couldn’t find your pieces this time. Try a clear, well-lit photo.</p><Link href="/wardrobe/add" className="mt-6 inline-block underline underline-offset-4">Upload another photo</Link></div>}
    {ready && !complete && current && <div className="mt-8 grid gap-10 md:grid-cols-[0.8fr_1fr] md:gap-16">
      <aside className="hidden md:block"><p className="mb-3 text-sm text-[#6D6257]">Your outfit reference</p><div className="relative aspect-[3/4] overflow-hidden rounded-3xl bg-[#EBE3D8]"><Image src={review.sourceImageUrl} alt="Your uploaded outfit" fill unoptimized sizes="420px" className="object-contain p-5" /></div></aside>
      <section aria-label={accessories && !pieces.main.length ? 'Accessory review' : 'Main-piece review'}>
        <div className="mb-5"><p aria-live="polite" className="mb-3 text-sm text-[#6D6257]">{Math.max(1, total - remaining + 1)} of {total}</p><div role="progressbar" aria-label="Pieces reviewed" aria-valuemin={0} aria-valuemax={total} aria-valuenow={total - remaining} className="h-1 overflow-hidden rounded-full bg-[#D8CEC2]"><div className="h-full bg-[#6D6257] transition-all" style={{ width: `${total ? (total - remaining) / total * 100 : 0}%` }} /></div></div>
        <FocusedPiece key={current.id} item={current} onHandled={(id) => { setHandled((ids) => [...ids, id]); void refresh() }} onEdited={(item) => { ++request.current; setReview((value) => ({ ...value, garments: value.garments.map((garment) => garment.id === item.id ? item : garment) })) }} />
      </section>
    </div>}
    {ready && !complete && !current && total > 0 && <section className="mx-auto mt-16 max-w-lg py-8"><h2 className="text-2xl font-medium">Main pieces are ready</h2>{pieces.accessories.length > 0 ? <><p className="mt-3 leading-relaxed text-[#6D6257]">{pieces.accessories.length} {pieces.accessories.length === 1 ? 'accessory is' : 'accessories are'} still available to review. You can come back to them later.</p><Button className="mt-8 h-12 w-full rounded-full" onClick={() => setAccessories(true)}>Review accessories</Button></> : <p className="mt-3 text-[#6D6257]">You’ve reviewed every main piece.</p>}<Button variant="outline" className="mt-3 h-12 w-full rounded-full" onClick={() => setFinished(true)}>Finish</Button></section>}
    {ready && complete && <section className="mt-12"><h2 className="text-2xl">{finished && remaining ? 'Your choices are saved' : 'All pieces reviewed'}</h2><p className="mt-3 text-[#6D6257]">{remaining ? 'The remaining pieces are here whenever you want to review them.' : 'The pieces you added are ready in your wardrobe.'}</p><Link href="/wardrobe" className="mt-7 inline-flex min-h-12 items-center rounded-full bg-[#1D1B18] px-7 text-[#FFFDFA]">Go to wardrobe</Link></section>}
    {ready && !total && <section className="mt-12"><h2 className="text-2xl">No clear pieces found</h2><p className="mt-3 text-[#6D6257]">Try a well-lit photo where each piece is easy to see.</p><Link href="/wardrobe/add" className="mt-6 inline-block underline underline-offset-4">Upload another photo</Link></section>}
  </div></main>
}
