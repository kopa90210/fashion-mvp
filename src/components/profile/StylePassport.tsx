'use client'

import { Sparkles } from 'lucide-react'
import type { ProfileStylePassport } from '@/src/lib/profile/types'
export { default as StylePassportDialog } from './StylePassportDialog'

interface StylePassportProps {
  passport: ProfileStylePassport
}

export default function StylePassport({ passport }: StylePassportProps) {
  const { topStyles, quizSignals, hasStyleData, caption } = passport

  if (!hasStyleData) {
    return (
      <section
        aria-labelledby="style-passport-title"
        className="mb-8 rounded-3xl border border-dashed p-6 text-center transition-colors duration-200 sm:p-8"
        style={{
          borderColor: 'var(--studio-border)',
          backgroundColor: 'var(--studio-surface-subtle)',
          color: 'var(--studio-text)',
        }}
      >
        <Sparkles aria-hidden="true" className="mx-auto size-7 opacity-60" style={{ color: 'var(--studio-accent)' }} />
        <h2 id="style-passport-title" className="mt-3 text-lg font-medium" style={{ color: 'var(--studio-text)' }}>
          Style Passport
        </h2>
        <p className="mt-1.5 text-xs" style={{ color: 'var(--studio-text-muted)' }}>
          Your style identity and calibrated signals will appear here as you interact with recommendations and curate your wardrobe.
        </p>
      </section>
    )
  }

  return (
    <section
      aria-labelledby="style-passport-title"
      className="relative mb-8 overflow-hidden rounded-3xl border p-6 shadow-xs transition-colors duration-200 sm:p-8"
      style={{
        backgroundColor: 'var(--studio-surface)',
        borderColor: 'var(--studio-border)',
        color: 'var(--studio-text)',
      }}
    >
      {/* Restrained atmospheric aura layer */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-70 transition-opacity duration-300"
        style={{ background: 'var(--studio-aura-gradient)' }}
      />

      {/* Card Header */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 border-b pb-4"
        style={{ borderColor: 'var(--studio-border-subtle)' }}
      >
        <div>
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-4" style={{ color: 'var(--studio-accent)' }} />
            <h2 id="style-passport-title" className="text-lg font-medium tracking-tight" style={{ color: 'var(--studio-text)' }}>
              Style Passport
            </h2>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'var(--studio-text-muted)' }}>{caption}</p>
        </div>

        <span
          className="rounded-full px-3 py-1 text-[11px] font-medium tracking-wide"
          style={{
            backgroundColor: 'var(--studio-surface-subtle)',
            color: 'var(--studio-text-muted)',
          }}
        >
          Calibrated DNA
        </span>
      </div>

      {/* Top Style Aesthetics (Ranking Tags) */}
      {topStyles.length > 0 && (
        <div className="pt-5">
          <p
            className="text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Strongest Aesthetic Signals
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {topStyles.map((style, index) => (
              <span
                key={style.key}
                className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors"
                style={
                  index === 0
                    ? {
                        backgroundColor: 'var(--studio-accent)',
                        color: 'var(--studio-accent-text)',
                      }
                    : index === 1
                    ? {
                        backgroundColor: 'var(--studio-surface-subtle)',
                        color: 'var(--studio-text)',
                      }
                    : {
                        border: '1px solid var(--studio-border)',
                        backgroundColor: 'var(--studio-surface)',
                        color: 'var(--studio-text-muted)',
                      }
                }
              >
                <span className="opacity-60 text-[10px]">#{index + 1}</span>
                {style.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Five Quiz Signals (Canonical Labels) */}
      {quizSignals && quizSignals.length > 0 ? (
        <div
          className="mt-6 border-t pt-5"
          style={{ borderColor: 'var(--studio-border-subtle)' }}
        >
          <p
            className="text-xs font-semibold uppercase tracking-[0.16em]"
            style={{ color: 'var(--studio-text-muted)' }}
          >
            Style Calibration Profile
          </p>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quizSignals.map((signal) => (
              <div
                key={signal.key}
                className="rounded-2xl border p-3.5"
                style={{
                  borderColor: 'var(--studio-border)',
                  backgroundColor: 'var(--studio-surface-subtle)',
                }}
              >
                <dt
                  className="text-[11px] font-medium uppercase tracking-[0.1em]"
                  style={{ color: 'var(--studio-text-muted)' }}
                >
                  {signal.label}
                </dt>
                <dd
                  className="mt-1 text-sm font-medium"
                  style={{ color: 'var(--studio-text)' }}
                >
                  {signal.valueLabel}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        /* Graceful legacy state: Older users without quiz signals */
        <div
          className="mt-6 border-t pt-4 text-xs italic"
          style={{
            borderColor: 'var(--studio-border-subtle)',
            color: 'var(--studio-text-muted)',
          }}
        >
          <p>
            Quiz calibration signals not recorded for this profile.
          </p>
        </div>
      )}
    </section>
  )
}
