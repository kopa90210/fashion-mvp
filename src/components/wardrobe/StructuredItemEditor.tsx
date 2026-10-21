'use client'

import { useMemo, useState, useTransition } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { WardrobeAttributeUpdates } from '@/src/app/actions/wardrobe'
import PhotoUploadForm from '@/src/app/(app)/wardrobe/add/PhotoUploadForm'
import { SUBCATEGORY_MAP, WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'
import GarmentImage from './GarmentImage'

type EditableItem = { id: string; category: string | null; subcategory: string | null; brand: string | null; display_name: string | null; image_url: string | null; color?: unknown; fit?: unknown; style_tags?: unknown; material?: string | null; season_weights?: unknown; layer_role?: string | null }
const field = 'mt-2 min-h-12 w-full rounded-xl border border-[#d8cec2] bg-[#fffdfa] px-3 py-3 text-base outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#6d6257]'
const colors = ['Black', 'White', 'Ivory', 'Grey', 'Navy', 'Blue', 'Brown', 'Green', 'Red', 'Pink', 'Yellow', 'Beige']
const fits = ['Slim', 'Regular', 'Relaxed', 'Oversized']
const materials = ['Cotton', 'Linen', 'Wool', 'Denim', 'Leather', 'Nylon', 'Silk']
const seasons = ['Spring', 'Summer', 'Autumn', 'Winter']
const styleChoices = ['minimal', 'casual', 'formal', 'streetwear', 'bohemian', 'edgy']

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function primary(value: unknown) {
  const raw = objectValue(value).primary
  return typeof raw === 'string' && raw !== 'Unknown' ? raw : ''
}

function selectedTags(value: unknown) {
  return Object.entries(objectValue(value)).filter(([, weight]) => typeof weight === 'number' && weight > 0).map(([key]) => key)
}

export default function StructuredItemEditor({ item, onClose, onSave, onRemove, onReplacePhoto }: { item: EditableItem; onClose: () => void; onSave: (updates: WardrobeAttributeUpdates) => Promise<unknown>; onRemove: () => Promise<unknown>; onReplacePhoto?: (file: File) => Promise<unknown> }) {
  const [category, setCategory] = useState(item.category ?? '')
  const [subcategory, setSubcategory] = useState(item.subcategory ?? '')
  const [brand, setBrand] = useState(item.brand ?? '')
  const [displayName, setDisplayName] = useState(item.display_name ?? '')
  const [color, setColor] = useState(primary(item.color))
  const [fit, setFit] = useState(primary(item.fit))
  const [material, setMaterial] = useState(item.material ?? '')
  const [seasonValues, setSeasonValues] = useState<string[]>(() => selectedTags(item.season_weights))
  const [tags, setTags] = useState<string[]>(() => selectedTags(item.style_tags))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const subcategories = useMemo(() => SUBCATEGORY_MAP[category as keyof typeof SUBCATEGORY_MAP] ?? [], [category])
  function toggleTag(tag: string) { setTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]) }
  function toggleSeason(season: string) { setSeasonValues((current) => current.includes(season) ? current.filter((value) => value !== season) : [...current, season]) }
  function save() {
    if (!displayName.trim() || !category) { setError('Please add a name and choose a category.'); return }
    startTransition(async () => {
      setError(null)
      try {
        const baseColor = objectValue(item.color)
        const baseFit = objectValue(item.fit)
        await onSave({ category, subcategory: subcategory || null, brand: brand.trim() || null, display_name: displayName.trim(), material: material || null, season_weights: Object.fromEntries(seasonValues.map((season) => [season.toLowerCase(), 1])), color: { ...baseColor, primary: color || 'Unknown' }, fit: { ...baseFit, primary: fit || 'Unknown' }, style_tags: Object.fromEntries(tags.map((tag) => [tag, 1])) })
        setMessage('Saved'); window.setTimeout(onClose, 400)
      } catch { setError('Could not save these details. Please try again.') }
    })
  }
  function remove() { if (!window.confirm('Remove this piece from your wardrobe?')) return; startTransition(async () => { try { await onRemove(); onClose() } catch { setError('Could not remove this piece. Please try again.') } }) }
  return <div role="dialog" aria-modal="true" aria-label="Edit item" className="fixed inset-0 z-[110] overflow-y-auto bg-[#1d1b18]/40 p-4"><section className="mx-auto my-4 max-w-xl rounded-3xl border border-[#d8cec2] bg-[#fffdfa] p-5 text-[#1d1b18] shadow-xl sm:my-8 sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.18em] text-[#7a6f62]">Item details</p><h2 className="mt-2 text-2xl font-medium">Edit {displayName || subcategory || 'item'}</h2></div><button type="button" onClick={onClose} aria-label="Close editor" className="flex size-11 shrink-0 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-[#6d6257]"><X className="size-5" /></button></div>{item.image_url && <div className="relative mt-6 aspect-[4/3] overflow-hidden rounded-2xl bg-[#ebe3d8]"><GarmentImage src={item.image_url} alt={displayName || 'Item'} label={displayName || 'Item'} role={item.layer_role} className="object-contain p-5" /></div>}<div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-sm">Name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={field} /></label><label className="text-sm">Brand <span className="text-[#8c7f72]">(optional)</span><input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="Add brand" className={field} /></label><label className="text-sm">Category<select value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory('') }} className={field}><option value="">Choose category</option>{WARDROBE_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Subcategory<select value={subcategory} onChange={(event) => setSubcategory(event.target.value)} className={field}><option value="">Choose type</option>{subcategories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Color<select value={color} onChange={(event) => setColor(event.target.value)} className={field}><option value="">Add color</option>{colors.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Fit<select value={fit} onChange={(event) => setFit(event.target.value)} className={field}><option value="">Add fit</option>{fits.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="text-sm">Material<select value={material} onChange={(event) => setMaterial(event.target.value)} className={field}><option value="">Add material</option>{materials.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><fieldset className="mt-5"><legend className="text-sm">Seasons</legend><div className="mt-2 flex flex-wrap gap-2">{seasons.map((season) => <button key={season} type="button" aria-pressed={seasonValues.includes(season.toLowerCase())} onClick={() => toggleSeason(season.toLowerCase())} className={`min-h-11 rounded-full border px-4 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-[#6d6257] ${seasonValues.includes(season.toLowerCase()) ? 'border-[#1d1b18] bg-[#1d1b18] text-[#fffdfa]' : 'border-[#d8cec2] bg-[#fffdfa] text-[#6d6257]'}`}>{season}</button>)}</div></fieldset><fieldset className="mt-5"><legend className="text-sm">Style tags</legend><div className="mt-2 flex flex-wrap gap-2">{styleChoices.map((tag) => <button key={tag} type="button" aria-pressed={tags.includes(tag)} onClick={() => toggleTag(tag)} className={`min-h-11 rounded-full border px-4 text-sm capitalize transition-colors focus-visible:outline-2 focus-visible:outline-[#6d6257] ${tags.includes(tag) ? 'border-[#1d1b18] bg-[#1d1b18] text-[#fffdfa]' : 'border-[#d8cec2] bg-[#fffdfa] text-[#6d6257]'}`}>{tag}</button>)}</div></fieldset>{onReplacePhoto && <div className="mt-6 border-t border-[#e5ddd3] pt-5"><h3 className="text-sm font-medium">Replace photo</h3><div className="mt-3"><PhotoUploadForm onUpload={onReplacePhoto} submitLabel="Replace photo" /></div></div>}<div className="mt-7 flex flex-wrap justify-between gap-3"><Button variant="destructive" onClick={remove} disabled={isPending} className="min-h-11 rounded-full">Remove</Button><div className="flex gap-2"><Button variant="outline" onClick={onClose} disabled={isPending} className="min-h-11 rounded-full">Cancel</Button><Button onClick={save} disabled={isPending} className="min-h-11 rounded-full bg-[#1d1b18] text-[#fffdfa]">{isPending ? 'Saving…' : 'Save changes'}</Button></div></div>{error && <p role="alert" className="mt-4 text-sm text-[#8a352e]">{error}</p>}{message && <p role="status" className="mt-4 text-right text-sm text-[#6d6257]">{message}</p>}</section></div>
}
