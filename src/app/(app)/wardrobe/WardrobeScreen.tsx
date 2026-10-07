'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import { Check, Filter, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmDraftItem, discardDraftItem, removeWardrobeItem, replaceWardrobeItemPhoto, updateWardrobeItemAttributes, type UserWardrobeItem } from '@/src/app/actions/wardrobe'
import type { WardrobeCategory } from '@/src/lib/wardrobe/normalize'
import ItemEditor from '@/src/components/wardrobe/ItemEditor'
import WishlistScreen from '@/src/app/(app)/wishlist/WishlistScreen'
import type { WishlistItem } from '@/src/app/actions/wishlist'
import { categoryLabels, filterOptions, filterWardrobe, itemDescriptor, itemName, knownBrand, type WardrobeFilters } from './wardrobe-view'

const selectClass = 'mt-2 w-full rounded-xl border border-[#D8CEC2] bg-[#FFFDFA] px-3 py-3 text-sm'
const gridClass = 'grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4'
const emptyFilters: WardrobeFilters = { search: '', category: 'all', subcategory: '', color: '', style: '', sort: 'newest' }

function ItemCard({ item, selected, selecting, onToggle, onDraftEdit }: {
  item: UserWardrobeItem; selected: boolean; selecting: boolean; onToggle: () => void; onDraftEdit?: () => void
}) {
  const content = <>
    <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-[#EBE3D8]">
      {item.image_url ? <Image src={item.image_url} alt={itemName(item)} fill unoptimized={item.image_url.includes('/storage/v1/object/sign/private-wardrobe-media/')} sizes="(min-width: 1024px) 250px, (min-width: 768px) 30vw, 45vw" className="object-contain p-4 sm:p-6 transition-transform duration-300 motion-safe:group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center text-sm text-[#6D6257]">Photo unavailable</div>}
      {item.quantity > 1 && <span className="absolute right-2 top-2 rounded-full bg-[#FFFDFA] px-2 py-1 text-xs">{item.quantity} pieces</span>}
      {selecting && <span aria-hidden="true" className={`absolute left-3 top-3 flex size-6 items-center justify-center rounded-full border ${selected ? 'border-[#1D1B18] bg-[#1D1B18] text-white' : 'border-[#D8CEC2] bg-[#FFFDFA] text-transparent'}`}><Check className="size-4" /></span>}
    </div>
    <p className="mt-3 truncate text-sm font-medium">{itemName(item)}</p>
    <p className="mt-1 truncate text-xs text-[#6D6257]">{itemDescriptor(item)}</p>
    {knownBrand(item.brand) && <p className="mt-1 truncate text-xs text-[#6D6257]">{knownBrand(item.brand)}</p>}
  </>
  const className = 'group block min-w-0 rounded-2xl text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#6D6257]'
  if (selecting || onDraftEdit) return <button type="button" aria-pressed={selecting ? selected : undefined} aria-label={selecting ? `Select ${itemName(item)}` : `Review ${itemName(item)}`} onClick={selecting ? onToggle : onDraftEdit} className={className}>{content}</button>
  return <Link href={`/wardrobe/${item.id}`} className={className}>{content}</Link>
}

export default function WardrobeScreen({ items, drafts, wishlistItems, outfitPhotos, categories }: {
  items: UserWardrobeItem[]; drafts: UserWardrobeItem[]; wishlistItems: WishlistItem[];
  outfitPhotos: Array<{ id: string; status: string; createdAt: string }>; categories: readonly WardrobeCategory[]
}) {
  const [view, setView] = useState<'closet' | 'wishlist'>('closet')
  const [filters, setFilters] = useState<WardrobeFilters>(emptyFilters)
  const [showFilters, setShowFilters] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [showDrafts, setShowDrafts] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [editing, setEditing] = useState<UserWardrobeItem | null>(null)
  const [isPending, startTransition] = useTransition()
  const owned = items.filter((item) => item.status === 'confirmed')
  const visible = filterWardrobe(owned, filters)
  const options = filterOptions(owned, 'all')
  const activeFilters = [filters.category !== 'all', !!filters.subcategory, !!filters.color, !!filters.style].filter(Boolean).length
  function chooseCategory(category: string) { setFilters((value) => ({ ...value, category, subcategory: '' })) }
  function toggle(id: string) { setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]) }
  function deleteSelected() {
    startTransition(async () => {
      try {
        await Promise.all(selected.map(removeWardrobeItem))
        setSelected([]); setSelecting(false); window.location.reload()
      } catch { setNotice('Some pieces could not be removed. Please refresh and try again.') }
    })
  }
  function draftAction(action: () => Promise<unknown>) {
    startTransition(async () => {
      try { await action(); window.location.reload() }
      catch { setNotice('Could not save this choice. Please try again.') }
    })
  }

  return <main className="min-h-screen bg-[#F7F4EF] px-4 py-7 text-[#1D1B18] sm:px-6 lg:px-8 lg:py-10"><div className="mx-auto max-w-6xl">
    <nav aria-label="Wardrobe views" className="mb-8 flex gap-7 text-sm">
      <button type="button" aria-pressed={view === 'closet'} onClick={() => setView('closet')} className={`min-h-11 border-b-2 ${view === 'closet' ? 'border-[#1D1B18]' : 'border-transparent text-[#6D6257]'}`}>Wardrobe</button>
      <button type="button" aria-pressed={view === 'wishlist'} onClick={() => setView('wishlist')} className={`min-h-11 border-b-2 ${view === 'wishlist' ? 'border-[#1D1B18]' : 'border-transparent text-[#6D6257]'}`}>Wishlist</button>
    </nav>
    {view === 'wishlist' ? <WishlistScreen items={wishlistItems} categories={categories} embedded /> : <>
      <header className="flex items-end justify-between gap-4">
        <div><h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Your wardrobe</h1><p className="mt-3 text-sm text-[#6D6257]">{owned.length} pieces</p></div>
        <Link href="/wardrobe/add" className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-[#1D1B18] px-5 text-sm text-[#FFFDFA]">Add clothes</Link>
      </header>
      <label className="relative mt-7 block"><span className="sr-only">Search your wardrobe</span><Search aria-hidden="true" className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#6D6257]" /><input type="search" placeholder="Search your wardrobe" value={filters.search} onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))} className="h-12 w-full rounded-full border border-[#D8CEC2] bg-[#FFFDFA] pl-11 pr-4 text-base outline-offset-4" /></label>
      <div className="mt-5 flex gap-6 overflow-x-auto border-b border-[#D8CEC2]" aria-label="Wardrobe categories">{(['all', ...categories]).map((value) => <button key={value} type="button" aria-pressed={filters.category === value} onClick={() => chooseCategory(value)} className={`min-h-12 shrink-0 border-b-2 text-sm ${filters.category === value ? 'border-[#1D1B18] font-medium' : 'border-transparent text-[#6D6257]'}`}>{categoryLabels[value]}</button>)}</div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button type="button" aria-expanded={showFilters} aria-controls="wardrobe-filters" onClick={() => setShowFilters(!showFilters)} className="inline-flex min-h-11 items-center gap-2 text-sm"><Filter aria-hidden="true" className="size-4" />Filters{activeFilters > 0 ? ` (${activeFilters})` : ''}</button>
        <div className="flex items-center gap-3"><label className="text-sm"><span className="sr-only">Sort wardrobe</span><select aria-label="Sort wardrobe" value={filters.sort} onChange={(event) => setFilters((value) => ({ ...value, sort: event.target.value as WardrobeFilters['sort'] }))} className="min-h-11 bg-transparent text-sm"><option value="newest">Newest</option><option value="oldest">Oldest</option><option value="az">A–Z</option></select></label>
          <Button variant="ghost" disabled={isPending || showDrafts} className="h-11" onClick={() => { setSelecting(!selecting); setSelected([]) }}>{selecting ? 'Done' : 'Select'}</Button>
          {selecting && selected.length > 0 && <Button variant="destructive" disabled={isPending} onClick={deleteSelected} aria-label={`Remove ${selected.length} selected pieces`} className="h-11"><Trash2 className="size-4" />Remove ({selected.length})</Button>}
        </div>
      </div>
      {showFilters && <section id="wardrobe-filters" aria-label="Filter your wardrobe" className="mt-3 rounded-2xl bg-[#EBE3D8]/60 p-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm">Category<select value={filters.category} onChange={(event) => chooseCategory(event.target.value)} className={selectClass}><option value="all">All categories</option>{categories.map((value) => <option key={value} value={value}>{categoryLabels[value]}</option>)}</select></label>
          <label className="text-sm">Subcategory<select value={filters.subcategory} onChange={(event) => setFilters((value) => ({ ...value, subcategory: event.target.value }))} className={selectClass}><option value="">All types</option>{options.subcategories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-sm">Primary color<select value={filters.color} onChange={(event) => setFilters((value) => ({ ...value, color: event.target.value }))} className={selectClass}><option value="">All colors</option>{options.colors.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          <label className="text-sm">Style tag<select value={filters.style} onChange={(event) => setFilters((value) => ({ ...value, style: event.target.value }))} className={selectClass}><option value="">All styles</option>{options.styles.map((value) => <option key={value} value={value}>{value.replace(/_/g, ' ')}</option>)}</select></label>
        </div><button type="button" onClick={() => setFilters((value) => ({ ...emptyFilters, search: value.search, sort: value.sort }))} className="mt-4 min-h-11 text-sm underline underline-offset-4">Clear filters</button>
      </section>}
      {showDrafts ? <section className="mt-8"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-medium">Pieces to review</h2><p className="mt-2 text-sm text-[#6D6257]">These pieces enter your wardrobe only when you confirm them.</p></div><button type="button" onClick={() => setShowDrafts(false)} aria-label="Close drafts" className="flex size-11 items-center justify-center"><X className="size-5" /></button></div><div className={gridClass}>{drafts.map((item) => <div key={item.id}><ItemCard item={item} selected={false} selecting={false} onToggle={() => undefined} onDraftEdit={() => setEditing(item)} /><div className="mt-3 flex flex-wrap gap-2"><Button className="h-11" onClick={() => draftAction(() => confirmDraftItem(item.id))} disabled={isPending}>Confirm</Button><Button className="h-11" variant="outline" onClick={() => draftAction(() => discardDraftItem(item.id))} disabled={isPending}>Discard</Button></div></div>)}</div></section> : <section aria-label="Your wardrobe pieces" className={`mt-7 ${gridClass}`}>{visible.map((item) => <ItemCard key={item.id} item={item} selected={selected.includes(item.id)} selecting={selecting} onToggle={() => toggle(item.id)} />)}</section>}
      {!showDrafts && !visible.length && <section className="py-16 text-center"><h2 className="text-xl font-medium">{owned.length ? 'No pieces match just yet' : 'Make room for your clothes'}</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-[#6D6257]">{owned.length ? 'Try a different search or clear your filters.' : 'Add clothes you own to start building your personal wardrobe.'}</p>{owned.length ? <button type="button" onClick={() => setFilters(emptyFilters)} className="mt-5 min-h-11 text-sm underline underline-offset-4">Reset search and filters</button> : <Link href="/wardrobe/add" className="mt-5 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Add your first piece</Link>}</section>}
      {drafts.length > 0 && !showDrafts && <button type="button" onClick={() => { setSelecting(false); setSelected([]); setShowDrafts(true) }} className="mt-8 min-h-11 text-sm underline underline-offset-4">Review {drafts.length} pending {drafts.length === 1 ? 'piece' : 'pieces'}</button>}
      {outfitPhotos.length > 0 && <section className="mt-10 border-t border-[#D8CEC2] pt-5" aria-label="Recent uploads"><h2 className="text-sm font-medium">Recent uploads</h2><div className="mt-3 flex gap-4 overflow-x-auto pb-2">{outfitPhotos.map((photo) => <Link key={photo.id} href={`/wardrobe/add/review/${photo.id}`} className="min-h-11 shrink-0 text-sm text-[#6D6257] underline underline-offset-4">{photo.status === 'done' ? 'Review pieces' : photo.status === 'failed' ? 'Photo needs attention' : 'Finding your pieces'} · {new Date(photo.createdAt).toLocaleDateString('en-GB', { timeZone: 'UTC' })}</Link>)}</div></section>}
      {notice && <p role="status" className="mt-5 text-sm text-[#6D6257]">{notice}</p>}
      {editing && <ItemEditor item={editing} onClose={() => setEditing(null)} onSave={(updates) => updateWardrobeItemAttributes(editing.id, updates).then(() => window.location.reload())} onRemove={() => removeWardrobeItem(editing.id).then(() => window.location.reload())} onReplacePhoto={(file) => replaceWardrobeItemPhoto(editing.id, file).then(() => window.location.reload())} />}
    </>}
  </div></main>
}
