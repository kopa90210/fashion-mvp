'use client'

import { Button } from '@/components/ui/button'

export default function CalibrationError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="px-4 py-10 text-[#1d1b18] sm:px-6">
      <section className="mx-auto flex min-h-[65vh] max-w-xl flex-col items-center justify-center rounded-[2rem] border border-[#d8cec2] bg-[#fffdfa]/65 px-6 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#7a6f62]">Style check</p>
        <h1 className="mt-3 text-3xl font-medium tracking-tight">We couldn&apos;t load this look.</h1>
        <p className="mt-3 max-w-sm text-sm leading-6 text-[#6d6257]">
          Your progress is safe. Try loading the current look again.
        </p>
        <Button type="button" onClick={reset} className="mt-6 h-12 rounded-full bg-[#1d1b18] px-7 text-[#fffdfa] focus-visible:ring-2 focus-visible:ring-[#1d1b18] focus-visible:ring-offset-2">
          Retry
        </Button>
      </section>
    </main>
  )
}
