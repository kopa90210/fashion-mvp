'use client'

import type { DnaSignal } from '@/src/lib/fashion-dna/types'

export interface FashionDnaPanelProps {
  /** Sorted DnaSignal[] to render as weight bars. */
  signals: DnaSignal[]
  /**
   * When true, signals are grouped under sub-headers by their
   * `category` field (e.g. "Style", "Season"). Default: false.
   * Phase 1 only has "style", so this is a no-op for now.
   */
  groupByCategory?: boolean
  /**
   * Total feedback rows the user has submitted. When below the
   * LEARNING_THRESHOLD, a "still learning" caption is shown to
   * frame the weights as provisional, not settled facts.
   */
  feedbackCount?: number
}

/** Below this many swipes, show the "still learning" qualifier. */
const LEARNING_THRESHOLD = 5

export default function FashionDnaPanel({
  signals,
  groupByCategory = false,
  feedbackCount,
}: FashionDnaPanelProps) {
  const visibleSignals = signals.slice(0, 4)
  const isStillLearning =
    typeof feedbackCount === 'number' && feedbackCount < LEARNING_THRESHOLD

  // Group signals by category when requested
  const groups: [string, DnaSignal[]][] = groupByCategory
    ? Array.from(
        visibleSignals.reduce<Map<string, DnaSignal[]>>((acc, signal) => {
          const cat = signal.category ?? 'other'
          const list = acc.get(cat) ?? []
          list.push(signal)
          acc.set(cat, list)
          return acc
        }, new Map()),
      )
    : [['', visibleSignals]]

  return (
    <section
      aria-labelledby="style-learning-title"
      data-secondary-insight="fashion-dna"
      className="rounded-3xl border border-[#d8cec2] bg-[#fffdfa]/65 p-5 text-[#1d1b18] sm:p-6"
    >
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7a6f62]">Your style is learning</p>
      <h2 id="style-learning-title" className="mt-2 text-xl font-medium tracking-tight">Your style is taking shape</h2>
      <p className="mt-2 text-sm leading-6 text-[#6d6257]">
        {isStillLearning ? 'Each choice helps the strongest signals become clearer.' : 'These are the strongest signals in your recent choices.'}
      </p>
      <div className="mt-6 space-y-5">
        {visibleSignals.length === 0 ? (
          <p className="rounded-2xl bg-[#f2ece4] px-4 py-3 text-sm leading-6 text-[#6d6257]">
            Your strongest style signals will appear here.
          </p>
        ) : groups.map(([category, categorySignals]) => (
          <div key={category} className="space-y-4">
            {groupByCategory && category && (
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8c7f72]">
                {category}
              </p>
            )}
            {categorySignals.map((signal) => (
              <div key={signal.key} className="space-y-2">
                <span className="text-sm font-medium">{signal.label}</span>
                <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-[#e6ddd2]">
                  <div
                    className="h-full rounded-full bg-[#596c5e] transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: `${Math.max(8, Math.min(100, Math.round(signal.weight * 100)))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}

      </div>
      <p className="mt-6 border-t border-[#e4dbd0] pt-4 text-xs leading-5 text-[#8c7f72]">Updated after every choice.</p>
    </section>
  )
}
