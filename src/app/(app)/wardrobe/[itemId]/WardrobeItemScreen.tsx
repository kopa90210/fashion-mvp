'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { removeWardrobeItem, replaceWardrobeItemPhoto, updateWardrobeItemAttributes } from '@/src/app/actions/wardrobe'
import { WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'
import PhotoUploadForm from '../add/PhotoUploadForm'
import { categoryLabels, itemDescriptor, itemName, knownBrand, primaryColor } from '../wardrobe-view'
import type { ItemIntelligence, LookPiece } from './item-intelligence'

const field = 'mt-2 w-full rounded-xl border border-[#D8CEC2] bg-[#FFFDFA] px-3 py-3 text-base'

function PieceImage({ piece }: { piece: LookPiece }) {
  return <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#EBE3D8]">{piece.imageUrl ? <Image src={piece.imageUrl} alt={piece.name} fill unoptimized sizes="(min-width: 768px) 180px, 40vw" className="object-contain p-4" /> : <div className="flex h-full items-center justify-center px-3 text-center text-xs text-[#6D6257]">{piece.name}</div>}</div>
}

export default function WardrobeItemScreen({ item, looks = [], matches = [], descriptors = [] }: Pick<ItemIntelligence, 'item'> & Partial<Omit<ItemIntelligence, 'item'>>) {
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const [editing, setEditing] = useState(false)
  const [replacing, setReplacing] = useState(false)
  const [name, setName] = useState(itemName(item))
  const [category, setCategory] = useState(item.category ?? '')
  const [subcategory, setSubcategory] = useState(item.subcategory ?? '')
  const [color, setColor] = useState(primaryColor(item))
  const [brand, setBrand] = useState(knownBrand(item.brand))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  useEffect(() => {
    if (editing) dialog.current?.showModal()
    else dialog.current?.close()
  }, [editing])
  function save() {
    if (!name.trim() || !WARDROBE_CATEGORIES.some((value) => value === category)) { setError('Please add a name and choose a category.'); return }
    startTransition(async () => {
      setError(null)
      try {
        await updateWardrobeItemAttributes(item.id, { display_name: name.trim(), category, subcategory: subcategory.trim() || null, brand: brand.trim() || null, color: { ...(item.color && typeof item.color === 'object' && !Array.isArray(item.color) ? item.color : {}), primary: color.trim() || 'Unknown' } })
        setEditing(false); router.refresh()
      } catch { setError('Could not save your changes. Please try again.') }
    })
  }
  function remove() {
    if (!window.confirm('Remove this piece from your wardrobe?')) return
    startTransition(async () => {
      setError(null)
      try { await removeWardrobeItem(item.id); router.push('/wardrobe'); router.refresh() }
      catch { setError('Could not remove this piece. Please try again.') }
    })
  }
  function openEditor() {
    setName(itemName(item)); setCategory(item.category ?? ''); setSubcategory(item.subcategory ?? '')
    setColor(primaryColor(item)); setBrand(knownBrand(item.brand)); setError(null); setEditing(true)
  }
  return <main className="min-h-screen bg-[#F7F4EF] px-5 py-7 text-[#1D1B18]"><div className="mx-auto max-w-4xl">
    <Link href="/wardrobe" aria-label="Back to wardrobe" className="mb-7 inline-flex size-11 items-center justify-center rounded-full border border-[#D8CEC2]"><ArrowLeft className="size-5" /></Link>
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      <div className="relative aspect-[4/5] overflow-hidden rounded-3xl bg-[#EBE3D8]">{item.image_url ? <Image src={item.image_url} alt={itemName(item)} fill unoptimized sizes="(min-width: 768px) 440px, 100vw" className="object-contain p-8" /> : <div className="flex h-full items-center justify-center text-[#6D6257]">Photo unavailable</div>}</div>
      <section className="md:py-8"><p className="text-xs uppercase tracking-[0.2em] text-[#6D6257]">Your wardrobe</p><h1 className="mt-3 text-3xl font-medium">{itemName(item)}</h1><p className="mt-3 text-[#6D6257]">{itemDescriptor(item)}</p>{knownBrand(item.brand) && <p className="mt-2 text-sm text-[#6D6257]">{knownBrand(item.brand)}</p>}
        {descriptors.length > 0 && <p className="mt-5 text-sm text-[#6D6257]">{descriptors.join(' · ')}</p>}
        <div className="mt-8 flex flex-col items-start gap-3">{looks.length > 0 ? <a href="#looks-with-piece" className="inline-flex min-h-12 items-center rounded-full bg-[#1D1B18] px-7 text-sm text-[#FFFDFA]">Style this piece</a> : <Button disabled aria-describedby="outfit-empty" className="h-12 rounded-full px-7">Style this piece</Button>}<button type="button" disabled={pending} onClick={openEditor} className="min-h-11 text-sm underline underline-offset-4">Edit details</button></div>
        <dialog ref={dialog} onCancel={(event) => { if (pending) event.preventDefault(); else setEditing(false) }} onClose={() => setEditing(false)} aria-labelledby="edit-piece-title" className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[90dvh] w-full max-w-none overflow-y-auto rounded-t-3xl bg-[#FFFDFA] p-6 text-[#1D1B18] backdrop:bg-black/35 sm:inset-0 sm:m-auto sm:max-w-lg sm:rounded-3xl"><div className="flex items-center justify-between"><h2 id="edit-piece-title" className="text-2xl font-medium">Edit details</h2><button type="button" disabled={pending} onClick={() => setEditing(false)} aria-label="Close details" className="flex size-11 items-center justify-center rounded-full"><X className="size-5" /></button></div><form onSubmit={(event) => { event.preventDefault(); save() }} className="mt-7 space-y-4">
          <label className="block text-sm">Name<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={pending} className={field} /></label>
          <label className="block text-sm">Category<select required value={category} onChange={(event) => setCategory(event.target.value)} disabled={pending} className={field}><option value="">Choose category</option>{WARDROBE_CATEGORIES.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
          <label className="block text-sm">Subcategory<input maxLength={120} value={subcategory} onChange={(event) => setSubcategory(event.target.value)} disabled={pending} className={field} /></label>
          <label className="block text-sm">Color<input maxLength={80} value={color} onChange={(event) => setColor(event.target.value)} disabled={pending} className={field} /></label>
          <label className="block text-sm">Brand (optional)<input maxLength={80} value={brand} onChange={(event) => setBrand(event.target.value)} disabled={pending} className={field} /></label>
          <div className="flex gap-3"><Button type="button" variant="outline" disabled={pending} onClick={() => { setEditing(false); setError(null) }} className="h-12 rounded-full">Cancel</Button><Button type="submit" disabled={pending} className="h-12 rounded-full">{pending ? 'Saving…' : 'Save details'}</Button></div>
        </form>{error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}</dialog>
        <div className="mt-7 flex flex-wrap gap-6"><button type="button" disabled={pending} aria-expanded={replacing} onClick={() => setReplacing(!replacing)} className="min-h-11 text-sm text-[#6D6257] underline underline-offset-4">Replace photo</button><button type="button" disabled={pending} onClick={remove} className="min-h-11 text-sm text-[#6D6257] underline underline-offset-4">Remove piece</button></div>
        {replacing && <PhotoUploadForm submitLabel="Replace photo" onUpload={async (file) => { try { await replaceWardrobeItemPhoto(item.id, file); setReplacing(false); router.refresh() } catch { throw new Error('Could not replace this photo. Please try again.') } }} />}
        {error && !editing && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
      </section>
    </div>
    <section className="mt-14 border-t border-[#D8CEC2] pt-8" aria-labelledby="looks-with-piece">
      <h2 id="looks-with-piece" tabIndex={-1} className="scroll-mt-8 text-2xl font-medium">Looks with this piece</h2>
      {looks.length ? <><p className="mt-3 text-sm text-[#6D6257]">Outfit ideas made from clothes in your wardrobe.</p><div className="mt-6 grid gap-10 lg:grid-cols-3">{looks.map((look, index) => <article key={look.map((piece) => piece.id).join('|')} aria-label={`Look ${index + 1}`}><h3 className="mb-3 text-sm font-medium">Look {index + 1}</h3><div className="grid grid-cols-2 gap-3">{look.map((piece) => <Link key={piece.id} href={`/wardrobe/${piece.id}`} aria-current={piece.id === item.id ? 'page' : undefined}><PieceImage piece={piece} /><p className="mt-2 truncate text-xs">{piece.name}</p></Link>)}</div></article>)}</div></> : <div className="py-8"><p id="outfit-empty" className="text-[#6D6257]">Add a few more pieces to unlock outfit ideas.</p><Link href="/wardrobe/add" className="mt-5 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Add clothes</Link></div>}
    </section>
    <section className="mt-14" aria-labelledby="best-matches"><h2 id="best-matches" className="text-2xl font-medium">Best matches</h2>{matches.length ? <><p className="mt-3 text-sm text-[#6D6257]">Pieces from your best looks above.</p><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{matches.map((piece) => <Link key={piece.id} href={`/wardrobe/${piece.id}`}><PieceImage piece={piece} /><p className="mt-3 truncate text-sm">{piece.name}</p><p className="mt-1 truncate text-xs text-[#6D6257]">{piece.descriptor}</p></Link>)}</div></> : <p className="mt-3 text-sm text-[#6D6257]">Your matches will appear alongside outfit ideas.</p>}</section>
  </div></main>
}
