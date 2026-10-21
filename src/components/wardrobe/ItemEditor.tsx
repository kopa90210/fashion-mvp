'use client'

import Image from 'next/image'
import { useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WardrobeAttributeUpdates } from '@/src/app/actions/wardrobe'
import PhotoUploadForm from '@/src/app/(app)/wardrobe/add/PhotoUploadForm'
import { SUBCATEGORY_MAP, WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'

type EditableItem = { id: string; category: string | null; subcategory: string | null; brand: string | null; display_name: string | null; image_url: string | null; color?: unknown; fit?: unknown; style_tags?: unknown }

export default function ItemEditor({ item, onClose, onSave, onRemove, onReplacePhoto }: { item: EditableItem; onClose: () => void; onSave: (updates: WardrobeAttributeUpdates) => Promise<unknown>; onRemove: () => Promise<unknown>; onReplacePhoto?: (file: File) => Promise<unknown> }) {
  const [category, setCategory] = useState(item.category ?? '')
  const [subcategory, setSubcategory] = useState(item.subcategory ?? '')
  const [brand, setBrand] = useState(item.brand ?? '')
  const [displayName, setDisplayName] = useState(item.display_name ?? '')
  const [color, setColor] = useState(() => JSON.stringify(item.color ?? {}, null, 2))
  const [fit, setFit] = useState(() => JSON.stringify(item.fit ?? {}, null, 2))
  const [styleTags, setStyleTags] = useState(() => JSON.stringify(item.style_tags ?? {}, null, 2))
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const subcategories = SUBCATEGORY_MAP[category as keyof typeof SUBCATEGORY_MAP] ?? []
  function jsonValue(value: string) { try { return JSON.parse(value) } catch { return value } }
  function save() { startTransition(async () => { await onSave({ category: category || null, subcategory: subcategory || null, brand: brand || null, display_name: displayName.trim() || null, color: jsonValue(color), fit: jsonValue(fit), style_tags: jsonValue(styleTags) }); setMessage('Saved'); setTimeout(onClose, 500) }) }
  function remove() { startTransition(async () => { await onRemove(); onClose() }) }
  return <div role="dialog" aria-modal="true" aria-label="Edit item" className="fixed inset-0 z-[110] overflow-y-auto bg-[#1d1b18]/40 p-4"><section className="mx-auto mt-8 max-w-lg rounded-lg bg-[#fffdfa] p-5 shadow-xl"><div className="flex items-start justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-[#7a6f62]">Item details</p><h2 className="mt-1 text-xl font-semibold">Edit {displayName || subcategory || 'item'}</h2></div><button type="button" onClick={onClose} aria-label="Close editor"><X className="size-5" /></button></div>{item.image_url && <div className="relative mt-5 aspect-[4/3] overflow-hidden rounded-lg bg-[#ebe3d8]"><Image src={item.image_url} alt={displayName || 'Item'} fill unoptimized className="object-cover" /></div>}<div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm">Name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2" /></label><label className="text-sm">Brand<input value={brand} onChange={(event) => setBrand(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2" /></label><label className="text-sm">Category<select value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory('') }} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2"><option value="">Unclassified</option>{WARDROBE_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Subcategory<select value={subcategory} onChange={(event) => setSubcategory(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2"><option value="">None</option>{subcategories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Color JSON<input value={color} onChange={(event) => setColor(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2" /></label><label className="text-sm">Fit JSON<input value={fit} onChange={(event) => setFit(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2" /></label><label className="text-sm sm:col-span-2">Style tags JSON<input value={styleTags} onChange={(event) => setStyleTags(event.target.value)} className="mt-1 w-full rounded-lg border border-[#d8cec2] bg-white px-3 py-2" /></label></div>{onReplacePhoto && <div className="mt-5 border-t border-[#e5ddd3] pt-5"><h3 className="text-sm font-semibold">Replace photo</h3><div className="mt-3"><PhotoUploadForm onUpload={onReplacePhoto} submitLabel="Replace photo" /></div></div>}<div className="mt-5 flex justify-between gap-3"><Button variant="destructive" onClick={remove} disabled={isPending}>Remove</Button><div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={isPending}>{isPending ? 'Saving...' : 'Save changes'}</Button></div></div>{message && <p role="status" className="mt-3 text-right text-sm">{message}</p>}</section></div>
}