'use client'

import DemoOfferNote from './DemoOfferNote'

import { useState, type FormEvent } from 'react'
import type { BrowseResult } from '@/src/lib/stylist/browse'

const input = 'mt-1 block w-full min-h-11 rounded-xl border border-[#d8cec2] px-3'
const panel = 'rounded-3xl border border-[#d8cec2] bg-[#fffdfa] p-5 sm:p-6'
const price = new Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' })
const roles = [['base_layer', 'Tops'], ['bottom', 'Bottoms'], ['one_piece', 'Dresses & one-pieces'], ['footwear', 'Shoes'], ['outerwear', 'Outerwear']]

export default function CatalogSearch() {
  const [result, setResult] = useState<BrowseResult | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState('')

  async function search(filters: string, page: number) {
    if (pending) return
    setPending(true)
    setError('')
    if (page === 1) setResult(null)
    const params = new URLSearchParams(filters)
    params.set('page', String(page))
    try {
      const response = await fetch('/api/stylist/catalog?' + params.toString())
      if (!response.ok) throw new Error('Search failed')
      setResult(await response.json() as BrowseResult)
      setSubmitted(filters)
    } catch {
      setError('Could not load products. Please try again.')
    } finally {
      setPending(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const params = new URLSearchParams()
    for (const [key, value] of new FormData(event.currentTarget)) {
      if (typeof value === 'string' && value.trim()) params.set(key, value.trim())
    }
    void search(params.toString(), 1)
  }

  return <section className="mt-4 space-y-4" aria-label="Browse retailer products">
    <form className={panel} onSubmit={submit}>
      <h2 className="font-serif text-3xl">Find clothing</h2>
      <p className="mt-2 text-sm text-[#6d6257]">Search by item or retailer. Leave search blank to browse.</p>
      <fieldset disabled={pending} className="mt-4 space-y-4">
        <label className="block text-sm">Search products
          <input name="q" className={input} dir="auto" maxLength={100} type="search" placeholder="e.g. jeans or بنطلون" />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="text-sm">Collection<select name="collection" className={input}>
            <option value="">All</option><option value="masculine">Men’s</option><option value="feminine">Women’s</option>
          </select></label>
          <label className="text-sm">Category<select name="role" className={input}>
            <option value="">All</option>{roles.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label className="text-sm">Max price (EGP)<input name="maxPrice" className={input}
            type="number" min="0.01" max="100000" step="0.01" /></label>
          <label className="text-sm">Sort by<select name="sort" className={input}>
            <option value="relevance">Best match</option><option value="price-asc">Lowest price</option>
            <option value="price-desc">Highest price</option>
          </select></label>
        </div>
        <button type="submit" className="min-h-11 rounded-full bg-[#1d1b18] px-5 text-sm text-white">Search</button>
      </fieldset>
    </form>
    <div aria-busy={pending} className="space-y-3">
      <p role="status" className="text-sm">{pending ? 'Searching…' : result?.catalogAvailable ? `${result.total} matching offers` : ''}</p>
      {error && <p role="alert" className={panel}>{error}</p>}
      {result && result.offers.length === 0 && <p className={panel}>{!result.catalogAvailable
        ? 'There are no recently checked offers right now.'
        : result.total ? 'No results on this page. Search again to start from the first page.'
        : 'No offers match these filters. Try a broader search or a higher budget.'}</p>}
      {!!result?.offers.length && <ul className="grid gap-3 sm:grid-cols-2">
        {result.offers.map(offer => <li key={offer.id} className={panel}>
          <p className="text-sm text-[#6d6257]">{offer.brand}</p>
          <h3 dir="auto" className="my-2 font-serif text-xl">{offer.title}</h3>
          <p className="font-medium">{price.format(offer.priceEgp)}</p>
          {offer.demo ? <DemoOfferNote offer={offer} /> : <>
          <p className="mt-2 text-xs text-[#6d6257]">Checked <time dateTime={offer.checkedAt}>{offer.checkedAt.slice(0, 10)}</time>. Confirm price and stock at the retailer.</p>
          <a href={offer.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-full border border-[#d8cec2] px-4 text-sm">
            View at {offer.brand} ↗
          </a></>}
        </li>)}
      </ul>}
      {result && (result.page > 1 || result.hasMore) && <nav className="flex items-center gap-4" aria-label="Search result pages">
        <button type="button" className="min-h-11 underline disabled:opacity-50" disabled={pending || result.page === 1}
          onClick={() => void search(submitted, result.page - 1)}>Previous</button>
        <span className="text-sm">Page {result.page}</span>
        <button type="button" className="min-h-11 underline disabled:opacity-50" disabled={pending || !result.hasMore}
          onClick={() => void search(submitted, result.page + 1)}>Next</button>
      </nav>}
    </div>
  </section>
}
