'use client'

import { useEffect, useRef } from 'react'
import { X, ImageOff, Sparkles } from 'lucide-react'
import Image from 'next/image'
import type { ProfileOutfitLook } from '@/src/lib/profile/types'
import { extractOutfitGarments } from '@/src/lib/profile/adapters'

interface OutfitDetailsDialogProps {
  isOpen: boolean
  outfit: ProfileOutfitLook | null
  onClose: () => void
}

export default function OutfitDetailsDialog({
  isOpen,
  outfit,
  onClose,
}: OutfitDetailsDialogProps) {
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

  if (!isOpen || !outfit) return null

  const garments = extractOutfitGarments(outfit)

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
        aria-labelledby="outfit-details-title"
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-[#D8CEC2] bg-[#FFFDFA] p-6 text-[#1D1B18] shadow-2xl transition-colors sm:p-8"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#E4DBD0] pb-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-[#6D6257]">
              <Sparkles className="size-3.5 text-[#1D1B18]" />
              Outfit Composition
            </div>
            <h2
              id="outfit-details-title"
              className="mt-1 text-xl font-medium tracking-tight text-[#1D1B18]"
            >
              Look Details
            </h2>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close details dialog"
            onClick={onClose}
            className="rounded-full p-1.5 text-[#6D6257] transition-colors hover:text-[#1D1B18] focus-visible:outline-2 focus-visible:outline-[#1D1B18]"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Styling Tip and Reasons */}
        {outfit.stylingTip && (
          <div className="mt-4 rounded-2xl bg-[#EBE3D8]/50 p-4 text-xs italic leading-5 text-[#6D6257]">
            &ldquo;{outfit.stylingTip}&rdquo;
          </div>
        )}

        {outfit.reasons && outfit.reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {outfit.reasons.map((reason, idx) => (
              <span
                key={idx}
                className="rounded-full bg-[#EBE3D8] px-2.5 py-1 text-[11px] text-[#6D6257]"
              >
                {reason}
              </span>
            ))}
          </div>
        )}

        {/* Garments List */}
        <div className="mt-6 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#6D6257]">
            Garments in this combination ({garments.length})
          </p>

          <div className="divide-y divide-[#E4DBD0] rounded-2xl border border-[#D8CEC2] bg-[#FFFDFA]">
            {garments.map((item) => (
              <div key={item.id} className="flex items-center gap-3.5 p-3.5">
                <div className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#D8CEC2] bg-[#F7F4EF]">
                  {item.imageUrl ? (
                    <Image
                      src={item.imageUrl}
                      alt={item.displayName}
                      fill
                      sizes="56px"
                      className="object-cover"
                    />
                  ) : (
                    <ImageOff
                      className="size-5 text-[#6D6257] opacity-50"
                      aria-label="Image unavailable"
                    />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#1D1B18]">
                    {item.displayName}
                  </p>
                  <p className="text-xs capitalize text-[#6D6257]">
                    {item.category || item.slot || 'Garment'}
                    {item.layerRole && ` · ${item.layerRole.replace('_', ' ')}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
