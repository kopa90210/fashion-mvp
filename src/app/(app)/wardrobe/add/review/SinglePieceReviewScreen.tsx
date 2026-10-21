'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { confirmDraftItem, discardDraftItem, updateWardrobeItemAttributes, type UserWardrobeItem } from '@/src/app/actions/wardrobe'
import { WARDROBE_CATEGORIES, SUBCATEGORY_MAP } from '@/src/lib/wardrobe/normalize'
import GarmentImage from '@/src/components/wardrobe/GarmentImage'

const field = 'mt-2 min-h-12 w-full rounded-xl border border-[#d8cec2] bg-[#fffdfa] px-3 py-3 text-base outline-offset-4 focus-visible:outline-2 focus-visible:outline-[#6d6257]'
const colors = ['Black', 'White', 'Ivory', 'Grey', 'Navy', 'Blue', 'Brown', 'Green', 'Red', 'Pink', 'Yellow', 'Beige']
const fits = ['Slim', 'Regular', 'Relaxed', 'Oversized']
const materials = ['Cotton', 'Linen', 'Wool', 'Denim', 'Leather', 'Nylon', 'Silk']
const seasons = ['Spring', 'Summer', 'Autumn', 'Winter']
const styleChoices = ['minimal', 'casual', 'formal', 'streetwear', 'bohemian', 'edgy']

function objectValue(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function primary(value: unknown) { const raw = objectValue(value).primary; return typeof raw === 'string' && raw !== 'Unknown' ? raw : '' }
function tags(value: unknown) { return Object.entries(objectValue(value)).filter(([, weight]) => typeof weight === 'number' && weight > 0).map(([key]) => key) }

export default function SinglePieceReviewScreen({ initial }: { initial: UserWardrobeItem }) {
  return <SinglePieceReviewForm key={JSON.stringify(initial)} initial={initial} />
}

function SinglePieceReviewForm({ initial }: { initial: UserWardrobeItem }) {
  const router = useRouter()
  const [item, setItem] = useState(initial)
  const [name, setName] = useState(initial.display_name ?? '')
  const [category, setCategory] = useState(initial.category ?? '')
  const [subcategory, setSubcategory] = useState(initial.subcategory ?? '')
  const [color, setColor] = useState(primary(initial.color))
  const [fit, setFit] = useState(primary(initial.fit))
  const [material, setMaterial] = useState(initial.material ?? '')
  const [seasonValues, setSeasonValues] = useState<string[]>(() => tags(initial.season_weights))
  const [styleTags, setStyleTags] = useState<string[]>(() => tags(initial.style_tags))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const subcategories = SUBCATEGORY_MAP[category as keyof typeof SUBCATEGORY_MAP] ?? []
  const ready = Boolean(name.trim() && category)

  useEffect(() => {
    if (item.status === 'draft' && !item.display_name) {
      const timer = window.setInterval(() => router.refresh(), 3000)
      return () => window.clearInterval(timer)
    }
  }, [item.status, item.display_name, router])
  function saveAndConfirm() {
    if (!ready) { setError('Add a name and choose a category before adding this piece.'); return }
    startTransition(async () => {
      setError(null)
      try {
        await updateWardrobeItemAttributes(item.id, { display_name: name.trim(), category, subcategory: subcategory || null, brand: item.brand?.trim() || null, material: material || null, season_weights: Object.fromEntries(seasonValues.map((season) => [season, 1])), color: { ...objectValue(item.color), primary: color || 'Unknown' }, fit: { ...objectValue(item.fit), primary: fit || 'Unknown' }, style_tags: Object.fromEntries(styleTags.map((tag) => [tag, 1])) })
        await confirmDraftItem(item.id)
        router.push('/wardrobe')
        router.refresh()
      } catch { setError('Could not add this piece yet. Please try again.') }
    })
  }
  function skip() { startTransition(async () => { try { await discardDraftItem(item.id); router.push('/wardrobe'); router.refresh() } catch { setError('Could not skip this piece. Please try again.') } }) }
  function toggleTag(tag: string) { setStyleTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag]) }
  function toggleSeason(season: string) { setSeasonValues((current) => current.includes(season) ? current.filter((value) => value !== season) : [...current, season]) }

  return <main className="min-h-dvh bg-[#f7f4ef] px-5 py-6 text-[#1d1b18] sm:px-8 sm:py-10"><div className="mx-auto max-w-4xl"><button type="button" onClick={() => router.push('/wardrobe')} aria-label="Back to wardrobe" className="flex size-11 items-center justify-center rounded-full border border-[#d8cec2] bg-[#fffdfa]/70 focus-visible:outline-2 focus-visible:outline-[#6d6257]"><ArrowLeft className="size-5" /></button><div className="mt-8 grid gap-8 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-12"><section><p className="text-xs font-medium uppercase tracking-[0.18em] text-[#7a6f62]">Review your piece</p><h1 className="mt-3 text-3xl font-medium tracking-tight">Make it yours before it enters your wardrobe.</h1><p className="mt-3 text-sm leading-6 text-[#6d6257]">The suggestions are a starting point. Check the details, then confirm the piece.</p><div className="mt-7 relative aspect-[4/5] overflow-hidden rounded-[2rem] bg-[#ebe3d8]"><GarmentImage src={item.image_url} alt={name || 'Uploaded garment'} label={name || 'Uploaded garment'} role={item.layer_role} sizes="(min-width: 768px) 40vw, 100vw" className="object-contain p-5 sm:p-8" /></div></section><section className="rounded-[2rem] border border-[#d8cec2] bg-[#fffdfa]/65 p-5 sm:p-7"><div aria-live="polite" className="text-sm text-[#6d6257]">{!item.display_name ? 'We are still reading the garment. You can add the details yourself now.' : 'Suggested details ready for your review.'}</div><div className="mt-6 space-y-4"><label className="block text-sm">Name<input value={name} onChange={(event) => setName(event.target.value)} className={field} placeholder="e.g. Black jacket" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Category<select value={category} onChange={(event) => { setCategory(event.target.value); setSubcategory('') }} className={field}><option value="">Choose category</option>{WARDROBE_CATEGORIES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="block text-sm">Subcategory<select value={subcategory} onChange={(event) => setSubcategory(event.target.value)} className={field}><option value="">Choose type</option>{subcategories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="block text-sm">Color<select value={color} onChange={(event) => setColor(event.target.value)} className={field}><option value="">Add color</option>{colors.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="block text-sm">Fit<select value={fit} onChange={(event) => setFit(event.target.value)} className={field}><option value="">Add fit</option>{fits.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><label className="block text-sm">Brand <span className="text-[#8c7f72]">(optional)</span><input value={item.brand ?? ''} onChange={(event) => setItem((current) => ({ ...current, brand: event.target.value }))} className={field} placeholder="Add brand" /></label><fieldset><legend className="text-sm">Style tags</legend><div className="mt-2 flex flex-wrap gap-2">{styleChoices.map((tag) => <button key={tag} type="button" aria-pressed={styleTags.includes(tag)} onClick={() => toggleTag(tag)} className={`min-h-11 rounded-full border px-4 text-sm capitalize focus-visible:outline-2 focus-visible:outline-[#6d6257] ${styleTags.includes(tag) ? 'border-[#1d1b18] bg-[#1d1b18] text-[#fffdfa]' : 'border-[#d8cec2] bg-[#fffdfa] text-[#6d6257]'}`}>{tag}</button>)}</div></fieldset></div><div className="mt-7 flex flex-col gap-3 sm:flex-row"><Button type="button" variant="outline" disabled={pending} onClick={skip} className="min-h-12 flex-1 rounded-full">Skip</Button><Button type="button" disabled={pending || !ready} onClick={saveAndConfirm} className="min-h-12 flex-[2] rounded-full bg-[#1d1b18] text-[#fffdfa]">{pending ? 'Saving…' : 'Add to wardrobe'}</Button></div>{error && <p role="alert" className="mt-4 text-sm text-[#8a352e]">{error}</p>}</section></div></div></main>
}
