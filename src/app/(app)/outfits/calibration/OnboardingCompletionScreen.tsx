'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { finalizeOnboardingSelection } from '@/src/app/actions/wardrobe'

export default function OnboardingCompletionScreen({ count, version }: { count: number; version: number }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finish = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await finalizeOnboardingSelection(version)
      router.replace('/outfits')
      router.refresh()
    } catch {
      // A lost response may follow a successful transaction. Re-read the
      // committed state before showing an error or attempting another write.
      router.refresh()
      setError('We could not confirm completion. Your selections are safe; refresh and try again.')
      setBusy(false)
    }
  }

  return <main className="mx-auto flex min-h-[70vh] max-w-xl flex-col items-center justify-center px-5 text-center text-[#1d1b18]">
    <p className="text-sm uppercase tracking-widest text-[#7a6f62]">Style check complete</p>
    <h1 className="mt-3 text-3xl font-semibold">Ready to build your wardrobe</h1>
    <p className="mt-3 text-sm text-[#6d6257]">Your style feedback is saved. Review your selected pieces before adding them.</p>
    <button type="button" onClick={finish} disabled={busy} className="mt-8 rounded-full bg-[#1d1b18] px-6 py-3 text-sm font-semibold text-white disabled:opacity-60">
      {busy ? 'Finishing…' : `Add your ${count} selected pieces and finish`}
    </button>
    <Link href="/quiz?done=true" className="mt-5 text-sm underline underline-offset-4">Change selected pieces</Link>
    {error && <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>}
  </main>
}
