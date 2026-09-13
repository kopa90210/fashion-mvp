'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Check, Filter, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmDraftItem, discardDraftItem, removeWardrobeItem, replaceWardrobeItemPhoto, updateWardrobeItemAttributes, type UserWardrobeItem } from '@/src/app/actions/wardrobe'
import { SUBCATEGORY_MAP, type WardrobeCategory } from '@/src/lib/wardrobe/normalize'
import ItemEditor from '@/src/components/wardrobe/ItemEditor'
import WishlistScreen from '@/src/app/(app)/wishlist/WishlistScreen'
import type { WishlistItem } from '@/src/app/actions/wishlist'

function ItemCard({ item, selected, selecting, onToggle, onEdit }: { item: UserWardrobeItem; selected: boolean; selecting: boolean; onToggle: () => void; onEdit: () => void }) {
  const label = item.display_name || item.subcategory || 'Wardrobe item'
  return <button type="button" onClick={selecting ? onToggle : onEdit} className={`relative min-w-0 text-left ${selecting ? 'cursor-pointer' : 'cursor-default'}`}>
    <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-[#d8cec2] bg-[#ebe3d8]">
      {item.image_url ? <Image src={item.image_url} alt={label} fill sizes="(min-width: 768px) 30vw, 45vw" className="object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-[#7a6f62]">No image</div>}
      {item.quantity > 1 && <span className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-[#1d1b18] text-xs font-semibold text-white">{item.quantity}</span>}
      {selecting && <span className={`absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border ${selected ? 'border-[#1d1b18] bg-[#1d1b18] text-white' : 'border-white bg-white/80 text-transparent'}`}><Check className="size-4" /></span>}
    </div>
    <p className="mt-2 truncate text-xs font-medium text-[#4f463d]">{item.brand || 'Unknown Brand'}</p>
    <p className="truncate text-sm text-[#1d1b18]">{label}</p>
  </button>
}

export default function WardrobeScreen({ items, drafts, wishlistItems, categories }: { items: UserWardrobeItem[]; drafts: UserWardrobeItem[]; wishlistItems: WishlistItem[]; categories: readonly WardrobeCategory[] }) {
  const [view, setView] = useState<'closet' | 'wishlist'>('closet')
  const [category, setCategory] = useState<WardrobeCategory | 'all'>('all')
  const [subcategory, setSubcategory] = useState<string | undefined>()
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<UserWardrobeItem | null>(null)
  const [isPending, startTransition] = useTransition()
  const visible = (category === 'all' ? items : items.filter((item) => item.category === category && (!subcategory || item.subcategory === subcategory)))
  const subcategories = category === 'all' ? [] : SUBCATEGORY_MAP[category] ?? []
  function toggle(id: string) { if (selecting) setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) }
  function deleteSelected() { startTransition(async () => { await Promise.all(selected.map(removeWardrobeItem)); setSelected([]); setSelecting(false); setNotice('Selected items removed.'); window.location.reload() }) }
  function draftAction(action: () => Promise<unknown>, message: string) { startTransition(async () => { await action(); setNotice(message); window.location.reload() }) }

  return <main className="min-h-screen bg-[#f7f4ef] px-4 py-7 text-[#1d1b18] sm:px-6 lg:py-10"><div className="mx-auto max-w-5xl">
    <div className="flex border-b border-[#d8cec2]"><button type="button" onClick={() => setView('closet')} className={`flex-1 pb-4 text-lg font-semibold ${view === 'closet' ? 'border-b-2 border-[#1d1b18] text-[#1d1b18]' : 'text-[#7a6f62]'}`}>Closet</button><button type="button" onClick={() => setView('wishlist')} className={`flex-1 pb-4 text-lg font-semibold ${view === 'wishlist' ? 'border-b-2 border-[#1d1b18] text-[#1d1b18]' : 'text-[#7a6f62]'}`}>Wishlist</button></div>
    {view === 'wishlist' ? <WishlistScreen items={wishlistItems} categories={categories} embedded /> : <>
    <header className="flex items-end justify-between gap-3"><div><p className="text-sm uppercase tracking-[0.18em] text-[#7a6f62]">Your closet</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Wardrobe</h1></div><label className="flex items-center gap-2 text-sm text-[#7a6f62]">Newest <select aria-label="Sort wardrobe" className="rounded-lg border border-[#d8cec2] bg-white/70 px-2 py-2 text-[#1d1b18]"><option>Newest</option></select></label></header>
    <div className="mt-6 flex items-center justify-between"><p className="text-sm text-[#7a6f62]">{items.length} confirmed items</p><div className="flex items-center gap-1"><Link href="/search" aria-label="Search wardrobe" className="flex size-9 items-center justify-center rounded-full text-[#7a6f62] hover:bg-[#ebe3d8]"><Search className="size-4" /></Link><button type="button" aria-label="Filter wardrobe" title="Filtering is coming soon" onClick={() => setNotice('Filtering is coming soon.')} className="flex size-9 items-center justify-center rounded-full text-[#7a6f62] hover:bg-[#ebe3d8]"><Filter className="size-4" /></button><Button variant={selecting ? 'secondary' : 'ghost'} size="sm" onClick={() => { setSelecting(!selecting); setSelected([]) }}>{selecting ? 'Done' : 'Select'}</Button>{selecting && selected.length > 0 && <Button variant="destructive" size="icon-sm" aria-label="Delete selected items" onClick={deleteSelected} disabled={isPending}><Trash2 className="size-4" /></Button>}</div></div>
    <div className="mt-5 flex gap-2 overflow-x-auto pb-1">{(['all', ...categories] as const).map((value) => <button key={value} type="button" onClick={() => { setCategory(value); setSubcategory(undefined) }} className={`shrink-0 rounded-full border px-4 py-2 text-sm capitalize ${category === value ? 'border-[#1d1b18] bg-[#1d1b18] text-white' : 'border-[#d8cec2] bg-white/50 text-[#6d6257]'}`}>{value}</button>)}</div>
    {subcategories.length > 0 && <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{subcategories.map((value) => <button key={value} type="button" onClick={() => setSubcategory(subcategory === value ? undefined : value)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs capitalize ${subcategory === value ? 'border-[#1d1b18] bg-[#1d1b18] text-white' : 'border-[#d8cec2] text-[#6d6257]'}`}>{value}</button>)}</div>}
    {showDrafts ? <section className="mt-8"><div className="mb-4 flex items-center justify-between"><h2 className="text-xl font-semibold">Drafts</h2><button type="button" onClick={() => setShowDrafts(false)} aria-label="Close drafts"><X className="size-5" /></button></div><div className="grid grid-cols-3 gap-x-3 gap-y-6">{drafts.map((item) => <div key={item.id}><ItemCard item={item} selected={false} selecting={false} onToggle={() => undefined} onEdit={() => setEditing(item)} /><div className="mt-2 flex gap-2"><Button size="sm" onClick={() => draftAction(() => confirmDraftItem(item.id), 'Draft confirmed.')} disabled={isPending}>Confirm</Button><Button size="sm" variant="outline" onClick={() => draftAction(() => discardDraftItem(item.id), 'Draft discarded.')} disabled={isPending}>Discard</Button></div></div>)}</div></section> : <div className="mt-8 grid grid-cols-3 gap-x-3 gap-y-6">{visible.map((item) => <ItemCard key={item.id} item={item} selected={selected.includes(item.id)} selecting={selecting} onToggle={() => toggle(item.id)} onEdit={() => setEditing(item)} />)}</div>}
    {drafts.length > 0 && !showDrafts && <button type="button" onClick={() => setShowDrafts(true)} className="fixed bottom-24 left-1/2 -translate-x-1/2 rounded-full bg-[#1d1b18] px-5 py-3 text-sm font-medium text-white shadow-lg">{drafts.length} item{drafts.length === 1 ? '' : 's'} in draft</button>}
    {notice && <p role="status" className="fixed bottom-24 left-4 rounded-lg border border-[#d8cec2] bg-[#fffdfa] px-4 py-3 text-sm shadow-lg">{notice}</p>}
    {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} onSave={(updates) => updateWardrobeItemAttributes(editing.id, updates).then(() => window.location.reload())} onRemove={() => removeWardrobeItem(editing.id).then(() => window.location.reload())} onReplacePhoto={(file) => replaceWardrobeItemPhoto(editing.id, file).then(() => window.location.reload())} />}
    </>}
  </div></main>
}