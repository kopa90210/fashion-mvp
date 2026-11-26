'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { createRequestGuard } from '@/src/lib/stylist/request-guard'
import type { Collection } from '@/src/lib/stylist/intent'
import type { Look, Result } from '@/src/lib/stylist/recommend'

type View = 'ask' | 'daily'
const prompts = [
  { text: 'ألبس إيه للشغل من دولابي؟', language: 'ar', direction: 'rtl' },
  { text: 'Find work trousers under 1,500 EGP', language: 'en', direction: 'ltr' },
] as const
const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#625142]'

function LookCard({ look }: { look: Look }) {
  return (
    <ul className="space-y-1 rounded-2xl bg-[#f7f4ef] p-3 text-sm">
      {look.pieces.map((piece, i) => (
        <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-2">
          <span dir="auto">{piece.name}</span>
          <span className="text-xs text-[#6d6257]">{piece.owned ? 'From your wardrobe' : 'New piece'}</span>
        </li>
      ))}
    </ul>
  )
}

export default function StylistSearch() {
  const [view, setView] = useState<View>('ask')
  const [question, setQuestion] = useState('')
  const [shoppingOptionsOpen, setShoppingOptionsOpen] = useState(false)
  const [budget, setBudget] = useState('')
  const [collection, setCollection] = useState<Collection>('masculine')
  const [result, setResult] = useState<Result | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const retry = useRef<{ body: string; key: string } | null>(null)
  const submitting = useRef(false)
  const guard = useRef(createRequestGuard())
  useEffect(() => { const current = guard.current; return () => current.invalidate() }, [])
  function invalidateInputs() {
    guard.current.invalidate()
    submitting.current = false
    setPending(false)
    setResult(null)
    setError('')
  }
  const changeView = (next: View) => {
    if (view !== next) { invalidateInputs(); setView(next) }
  }
  function updateQuestion(value: string) {
    invalidateInputs()
    setQuestion(value)
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (submitting.current) return
    submitting.current = true
    const ticket = guard.current.begin()
    setPending(true)
    setResult(null)
    setError('')
    try {
      const body = JSON.stringify({ view, ...(view === 'ask' ? { question } : {}), collection, budget: budget ? Number(budget) : null })
      if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() }
      const r = await fetch('/api/stylist', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': retry.current.key }, body, signal: ticket.signal,
      })
      const data = await r.json()
      if (!ticket.isCurrent()) return
      if (!r.ok) { setError(typeof data.error === 'string' ? data.error : 'Could not load the stylist.'); return }
      if (view === 'ask' && data.clarification === 'budget') setShoppingOptionsOpen(true)
      retry.current = null
      setResult(data)
    } catch { if (ticket.isCurrent()) setError('Could not load the stylist. Try again.') }
    finally { if (ticket.isCurrent()) { submitting.current = false; setPending(false) } }
  }
  const panel = 'rounded-3xl border border-[#d8cec2] bg-[#fffdfa] p-5 sm:p-6'
  const shoppingFields = (
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Shop collection
        <select className={'mt-1 block min-h-11 rounded-xl border border-[#d8cec2] px-3 ' + focus} value={collection} disabled={pending}
          onChange={(e) => { invalidateInputs(); setCollection(e.target.value as Collection) }}>
          <option value="masculine">Men’s</option><option value="feminine">Women’s</option>
        </select>
      </label>
      <label className="text-sm">Budget in EGP (optional)
        <input className={'mt-1 block min-h-11 w-full max-w-44 rounded-xl border border-[#d8cec2] px-3 ' + focus} type="number"
          min={1} max={100000} step={1} value={budget} disabled={pending}
          onChange={(e) => { invalidateInputs(); setBudget(e.target.value) }} />
      </label>
    </div>
  )
  return (
    <div className="mt-6">
      <div className="inline-flex gap-1 rounded-full bg-[#ebe3d8] p-1" aria-label="Stylist views" role="group">
        {([['ask', 'Ask Stylist'], ['daily', 'Daily Finds']] as const).map(([value, label]) => (
          <button key={value} type="button" disabled={pending} aria-pressed={view === value}
            className={`min-h-11 rounded-full px-4 text-sm ${focus} ${view === value ? 'bg-[#1d1b18] text-[#fffdfa]' : 'text-[#6d6257]'}`}
            onClick={() => changeView(value)}>{label}</button>
        ))}
      </div>
      <form className={`mt-4 space-y-4 ${panel}`} onSubmit={submit}>
        <div>
          <h2 className="font-serif text-3xl">{view === 'ask' ? 'What are you dressing for?' : 'Refresh your wardrobe'}</h2>
          <p className="mt-2 text-sm text-[#6d6257]">{view === 'ask' ? 'Ask about an outfit or a piece you want to buy.' : 'See a look you already own. Set a budget to look for one useful addition.'}</p>
        </div>
        {view === 'ask' && <>
          <label className="block text-sm">Your question
            <textarea className={'mt-1 block w-full rounded-xl border border-[#d8cec2] p-3 ' + focus} dir="auto" value={question}
              maxLength={280} rows={2} required disabled={pending} onChange={(e) => updateQuestion(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            {prompts.map(({ text, language, direction }) => <button key={text} type="button" dir={direction} lang={language} disabled={pending}
              className={'min-h-11 rounded-full border border-[#d8cec2] px-3 text-sm ' + focus}
              onClick={() => updateQuestion(text)}>{text}</button>)}
          </div>
        </>}
        {view === 'daily' ? shoppingFields : (
          <details open={shoppingOptionsOpen} onToggle={(event) => setShoppingOptionsOpen(event.currentTarget.open)}>
            <summary className={'flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-lg px-1 text-sm underline underline-offset-4 ' + focus}>Shopping options</summary>
            {shoppingFields}
          </details>
        )}
        <button type="submit" aria-disabled={pending} className={'min-h-11 rounded-full bg-[#1d1b18] px-5 text-sm text-[#fffdfa] aria-disabled:cursor-wait ' + focus}>
          {error ? 'Try again' : view === 'ask' ? 'Ask Stylist' : 'Show my finds'}
        </button>
        <p role="status" className={pending ? 'text-sm text-[#6d6257]' : 'sr-only'}>{pending ? 'Putting looks together…' : ''}</p>
      </form>
      <div className="mt-4 space-y-4" aria-live="polite" aria-busy={pending}>
        {error && <p role="alert" className={panel}>{error}</p>}
        {result?.status === 'empty' && <div className={panel}><p>Your wardrobe is empty. Add a few pieces to get started.</p><Link href="/wardrobe/add" className={'mt-2 inline-flex min-h-11 items-center rounded-lg underline ' + focus}>Add pieces</Link></div>}
        {result?.status === 'clarify' && <p className={panel}>{{
          intent: 'Ask for a look from your wardrobe, or tell us which piece you want to buy.',
          category: 'Which piece are you looking for? Try a shirt, trousers, shoes, a dress, or a jacket.',
          budget: 'What is your maximum budget in EGP?',
        }[result.clarification ?? 'intent']}</p>}
        {result?.status === 'no-match' && !result.discovery?.leads.length && <p className={panel}>{result.looks.length
          ? 'No checked product matched your request and formed two looks with your pieces.'
          : 'No complete look matched. Add more pieces to your wardrobe and try again.'}</p>}
        {result?.discovery && <section className={panel}>
          <h3 className="font-serif text-2xl">Retailer search results</h3>
          <p className="mt-2 text-sm text-[#6d6257]">Discovered product pages, not verified shopping recommendations. Check current price, availability and suitability at the retailer.</p>
          {result.discovery.status==='unavailable' && <p className="mt-3 text-sm">Retailer search is temporarily unavailable or the testing allowance is exhausted.</p>}
          {result.discovery.status==='ok' && !result.discovery.leads.length && <p className="mt-3 text-sm">No eligible retailer links were found.</p>}
          <ul className="mt-3 space-y-3">{result.discovery.leads.map(lead=><li key={lead.url} className="rounded-xl border border-[#d8cec2] p-3">
            <p className="font-medium" dir="auto">{lead.title}</p><p className="text-xs text-[#6d6257]">{lead.retailer}</p>
            <a href={lead.url} target="_blank" rel="noopener noreferrer" className={'mt-2 inline-flex min-h-11 items-center underline '+focus}>View retailer page ↗</a>
          </li>)}</ul>
        </section>}
        {!!result?.looks.length && <section className={panel}><h3 className="mb-3 font-serif text-2xl">Restyle what you own</h3>{result.looks.map((look, i) => <LookCard key={i} look={look} />)}</section>}
        {result?.provenance && <details className={panel}>
          <summary className="cursor-pointer text-sm font-medium">Generation Inspector</summary>
          <div className="mt-3 space-y-3 text-xs text-[#6d6257]">
            {([['Intent',result.provenance.intent],['Outfit selection',result.provenance.selection]] as const).map(([label,trace])=><section key={label}>
              <h4 className="font-medium">{label}: {trace ? trace.source.replaceAll('_',' ') : 'Not executed'}</h4>
              {trace?.model && <p>{trace.provider} · {trace.model}</p>}
              {trace?.attempts.map((a,i)=><p key={i}>{a.provider} · {a.model} · {a.outcome} · {a.latencyMs} ms</p>)}
            </section>)}
            {result.suggestion && !result.shoppingTrace && <p>Product ranking and unlock count: deterministic</p>}
          </div>
        </details>}
        {!!result?.explanation?.length && <section className={panel}><h3 className="font-medium">Why this works</h3><ul className="mt-2 space-y-1 text-sm">{result.explanation.map((reason,i)=><li key={i} dir="auto">{reason}</li>)}</ul>{result.stylingTip && <p className="mt-3 text-sm" dir="auto">{result.stylingTip}</p>}</section>}
        {result?.shoppingTrace && <details className={panel}>
          <summary className="cursor-pointer text-sm font-medium">Shopping generation trace</summary>
          {([['Product selection',result.shoppingTrace.product],['Compatibility review',result.shoppingTrace.compatibility]] as const).map(([label,trace])=><section key={label} className="mt-3 text-xs">
            <h4 className="font-medium">{label}: {trace?.source.replaceAll('_',' ') ?? 'Not executed'}{trace?.cached?' · Cached review (no new compatibility calls)':''}</h4>
            {trace?.attempts.map((a,i)=><p key={i}>{a.provider} · {a.model} · {a.outcome} · {a.latencyMs} ms</p>)}
          </section>)}
          <p className="mt-3 text-xs">Unlock count: deterministic calculation of unique sampled outfits.</p>
        </details>}
        {result?.suggestion && <section className={panel}><h3 className="font-serif text-2xl">One piece worth adding</h3>
          <h4 dir="auto" className="mt-2 font-medium">{result.suggestion.product.title}</h4>
          <p className="mt-2 text-sm">{result.suggestion.product.brand} · {Intl.NumberFormat('en-EG', { style: 'currency', currency: 'EGP' }).format(result.suggestion.product.priceEgp)}</p>
          {result.suggestion.unlockBasis && <p className="mt-3 text-sm">{result.suggestion.unlockCount} {result.suggestion.unlockBasis==='ai_reviewed_sample'?'AI-reviewed compatible':'structurally valid'} looks among {result.suggestion.evaluatedCount} sampled combinations. Not a total wardrobe unlock estimate.</p>}
          <p className="my-3 text-sm text-[#6d6257]">Two ways to wear it with pieces you own.</p>
          <div className="grid gap-2 sm:grid-cols-2">{result.suggestion.looks.map((look, i) => <LookCard key={i} look={look} />)}</div>
          <a className={'mt-4 inline-flex min-h-11 items-center rounded-full border border-[#d8cec2] px-4 text-sm ' + focus} href={result.suggestion.product.url} target="_blank" rel="noopener noreferrer">View at {result.suggestion.product.brand} ↗</a>
          <p className="mt-2 text-xs text-[#6d6257]">Catalog recorded {result.suggestion.product.checkedAt.slice(0, 10)}. Not live-verified. Confirm price, size and availability at the retailer.</p>
        </section>}
      </div>
    </div>
  )
}
