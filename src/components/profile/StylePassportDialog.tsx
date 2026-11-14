'use client'

import { useEffect, useRef } from 'react'
import { Sparkles, X } from 'lucide-react'
import type { ProfileStylePassport } from '@/src/lib/profile/types'

export interface StylePassportDialogProps {
  isOpen: boolean
  passport: ProfileStylePassport
  onClose: () => void
}

export default function StylePassportDialog({
  isOpen,
  passport,
  onClose,
}: StylePassportDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  // Store trigger focus and restore when dialog closes
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      requestAnimationFrame(() => {
        closeButtonRef.current?.focus()
      })
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
    }
  }, [isOpen])

  // Handle Escape key and focus trap
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (event.shiftKey) {
          if (document.activeElement === firstElement) {
            event.preventDefault()
            lastElement?.focus()
          }
        } else {
          if (document.activeElement === lastElement) {
            event.preventDefault()
            firstElement?.focus()
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const { topStyles, quizSignals, hasStyleData, caption } = passport

  return (
    <div
      role="presentation"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs transition-opacity duration-200"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="passport-dialog-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#D8CEC2] bg-[#FFFDFA] p-6 text-[#1D1B18] shadow-2xl transition-colors sm:p-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E4DBD0] pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles aria-hidden="true" className="size-4 text-[#1D1B18]" />
              <h2
                id="passport-dialog-title"
                className="text-lg font-medium tracking-tight text-[#1D1B18] sm:text-xl"
              >
                Style Passport
              </h2>
            </div>
            <p className="mt-1 text-xs text-[#6D6257]">
              {caption}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="rounded-full bg-[#EBE3D8] px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-[#6D6257]">
              Calibrated DNA
            </span>

            <button
              ref={closeButtonRef}
              type="button"
              aria-label="Close Style Passport dialog"
              onClick={onClose}
              className="rounded-full p-1.5 text-[#6D6257] transition-colors hover:text-[#1D1B18] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D1B18]"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {!hasStyleData ? (
          <div className="my-6 rounded-2xl border border-dashed border-[#D8CEC2] bg-[#EBE3D8]/40 p-6 text-center">
            <Sparkles aria-hidden="true" className="mx-auto size-6 text-[#6D6257] opacity-60" />
            <p className="mt-2 text-sm font-medium text-[#1D1B18]">
              Your style identity will appear here
            </p>
            <p className="mt-1 text-xs text-[#6D6257]">
              As you interact with daily recommendations and curate your wardrobe, your calibrated signals will be reflected in your Style Passport.
            </p>
          </div>
        ) : (
          <div className="space-y-6 pt-5">
            {/* Top Style Aesthetics */}
            {topStyles.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6D6257]">
                  Strongest Aesthetic Signals
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {topStyles.map((style, index) => (
                    <span
                      key={style.key}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                        index === 0
                          ? 'bg-[#1D1B18] text-[#FFFDFA]'
                          : index === 1
                          ? 'bg-[#EBE3D8] text-[#1D1B18]'
                          : 'border border-[#D8CEC2] bg-[#FFFDFA] text-[#6D6257]'
                      }`}
                    >
                      <span className="text-[10px] opacity-60">#{index + 1}</span>
                      {style.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Quiz Calibration Profile */}
            {quizSignals && quizSignals.length > 0 ? (
              <div className="border-t border-[#E4DBD0] pt-5">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6D6257]">
                  Style Calibration Profile
                </p>
                <dl className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {quizSignals.map((signal) => (
                    <div
                      key={signal.key}
                      className="rounded-2xl border border-[#D8CEC2] bg-[#EBE3D8]/40 p-3.5 transition-colors"
                    >
                      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-[#6D6257]">
                        {signal.label}
                      </dt>
                      <dd className="mt-1 text-sm font-medium text-[#1D1B18]">
                        {signal.valueLabel}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : (
              <div className="border-t border-[#E4DBD0] pt-4 text-xs italic text-[#6D6257]">
                Quiz calibration signals not recorded for this profile.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
