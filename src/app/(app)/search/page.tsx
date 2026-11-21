import { createClient } from '@/src/lib/supabase/server'
import { pilotAllows } from '@/src/lib/stylist/pilot'
import StylistSearch from './StylistSearch'

async function canSeeStylist() {
  if (process.env.ENABLE_STYLIST !== 'true') return false
  if (process.env.STYLIST_PILOT_USER_IDS === undefined) return process.env.NODE_ENV === 'development'
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user !== null && pilotAllows(user.id)
}

export default async function SearchPage() {
  if (!(await canSeeStylist())) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[#f7f4ef] px-6 text-center text-[#1d1b18]">
        <div>
          <p className="text-sm uppercase tracking-[0.18em] text-[#7a6f62]">Search</p>
          <h1 className="mt-3 text-3xl font-semibold">Coming soon</h1>
        </div>
      </main>
    )
  }
  return (
    <main className="mx-auto max-w-5xl px-5 pb-12 pt-8 text-[#1d1b18] sm:px-8 sm:pt-14 font-[family-name:var(--font-geist-sans,system-ui)]">
      <h1 className="mt-3 font-serif text-5xl tracking-tight sm:text-7xl">The Style Edit.</h1>
      <p className="mt-3 max-w-md text-[#6d6257]">Restyle what you own. Find one piece worth adding when you need it.</p>
      <StylistSearch />
    </main>
  )
}
