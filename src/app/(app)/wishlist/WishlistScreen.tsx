'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { Heart, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { addWishlistItem, removeWishlistItem, updateWishlistItemAttributes, type WishlistItem } from '@/src/app/actions/wishlist'
import { SUBCATEGORY_MAP, type WardrobeCategory } from '@/src/lib/wardrobe/normalize'
import PhotoUploadForm from '@/src/app/(app)/wardrobe/add/PhotoUploadForm'
import ItemEditor from '@/src/components/wardrobe/ItemEditor'

export default function WishlistScreen({ items, categories, embedded = false }: { items: WishlistItem[]; categories: readonly WardrobeCategory[]; embedded?: boolean }) {
  const [category, setCategory] = useState<WardrobeCategory | 'all'>('all')
  const [subcategory, setSubcategory] = useState<string | undefined>()
  const [editing, setEditing] = useState<WishlistItem | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const visible = category === 'all' ? items : items.filter((item) => item.category === category && (!subcategory || item.subcategory === subcategory))
  const subcategories = category === 'all' ? [] : SUBCATEGORY_MAP[category] ?? []
  function remove(id: string) { startTransition(async () => { await removeWishlistItem(id); setNotice('Removed from wishlist.'); window.location.reload() }) }
  return <section className={embedded ? 'pt-7' : 'min-h-screen bg-[#f7f4ef] px-4 py-7 text-[#1d1b18] sm:px-6 lg:py-10'}><div className={embedded ? '' : 'mx-auto max-w-5xl'}>
    <header className="flex items-end justify-between gap-3"><div><p className="text-sm uppercase tracking-[0.18em] text-[#7a6f62]">Pieces to find</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Wishlist</h1></div><Heart className="size-6 text-[#7a6f62]" /></header>
    <div className="mt-6 flex gap-2 overflow-x-auto pb-1">{(['all', ...categories] as const).map((value) => <button key={value} type="button" onClick={() => { setCategory(value); setSubcategory(undefined) }} className={`shrink-0 rounded-full border px-4 py-2 text-sm capitalize ${category === value ? 'border-[#1d1b18] bg-[#1d1b18] text-white' : 'border-[#d8cec2] bg-white/50 text-[#6d6257]'}`}>{value}</button>)}</div>
    {subcategories.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{subcategories.map((value) => <button key={value} type="button" onClick={() => setSubcategory(subcategory === value ? undefined : value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize ${subcategory === value ? 'border-[#1d1b18] bg-[#1d1b18] text-white' : 'border-[#d8cec2] text-[#6d6257]'}`}>{value}</button>)}</div>}
    <section className="mt-8 border-b border-[#ded4c8] pb-8"><h2 className="text-lg font-semibold">Add a desired piece</h2><p className="mt-1 text-sm text-[#7a6f62]">Save a photo now and add details whenever you are ready.</p><div className="mt-4 max-w-md"><PhotoUploadForm onUpload={async (file) => { await addWishlistItem(file); window.location.reload() }} submitLabel="Add to wishlist" /></div></section>
    <div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3">{visible.map((item) => { const label = item.display_name || item.subcategory || 'Wishlist item'; return <article key={item.id} className="min-w-0"><button type="button" onClick={() => setEditing(item)} className="block w-full text-left"><div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-[#d8cec2] bg-[#ebe3d8]">{item.image_url ? <Image src={item.image_url} alt={label} fill sizes="(min-width: 768px) 30vw, 45vw" className="object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-[#7a6f62]">No image</div>}</div><p className="mt-2 truncate text-xs font-medium text-[#4f463d]">{item.brand || 'Unknown Brand'}</p><p className="truncate text-sm">{label}</p></button><Button variant="ghost" size="icon-sm" aria-label={`Remove ${label}`} onClick={() => remove(item.id)} disabled={isPending} className="mt-1"><Trash2 className="size-4" /></Button></article> })}</div>
    {notice && <p role="status" className="fixed bottom-24 left-4 rounded-lg border border-[#d8cec2] bg-[#fffdfa] px-4 py-3 text-sm shadow-lg">{notice}</p>}
    {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} onSave={(updates) => updateWishlistItemAttributes(editing.id, updates).then(() => window.location.reload())} onRemove={() => removeWishlistItem(editing.id).then(() => window.location.reload())} />}
  </div></section>
}
