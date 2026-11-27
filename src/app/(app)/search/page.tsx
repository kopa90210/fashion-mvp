import StylistSearch from './StylistSearch'
import {loadShoppingPreferences} from '@/src/lib/stylist/shopping-preferences-server'
import {preferencesEnabled} from '@/src/lib/stylist/shopping-preferences'

export default async function SearchPage() {
  if (process.env.ENABLE_STYLIST !== 'true') {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f7f4ef] px-6 text-center text-[#1d1b18]">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[#7a6f62]">Search</p>
          <h1 className="mt-3 text-3xl font-semibold">Coming soon</h1>
        </div>
      </main>
    )
  }
  const initialPreferences=await loadShoppingPreferences().catch(()=>null)
  return (
    <main className="mx-auto max-w-5xl px-5 pb-12 pt-8 text-[#1d1b18] sm:px-8 sm:pt-14 font-[family-name:var(--font-geist-sans,system-ui)]">
      <h1 className="mt-3 font-serif text-5xl tracking-tight sm:text-7xl">The Style Edit.</h1>
      <p className="mt-3 max-w-md text-[#6d6257]">Your wardrobe, your style. Ask what to wear or discover a useful addition with daily research.</p>
      <StylistSearch initialPreferences={initialPreferences} persistenceEnabled={preferencesEnabled()}/>
    </main>
  )
}
