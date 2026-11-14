'use client'

import { useState } from 'react'
import { Crown, Info, Loader2, Sparkles, X, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import OutfitCanvas from '@/src/components/outfit/OutfitCanvas'
import type { SignatureLookData } from '@/src/lib/profile/types'
import {
  extractOutfitGarments,
  profileGarmentsToWardrobeItems,
} from '@/src/lib/profile/adapters'
import OutfitDetailsDialog from './OutfitDetailsDialog'

interface SignatureLookCardProps {
  signatureLook: SignatureLookData | null
  isPending?: boolean
  onUnpin: () => void
  onBrowseCollection?: () => void
  onReplace?: () => void
}

export default function SignatureLookCard({
  signatureLook,
  isPending = false,
  onUnpin,
  onBrowseCollection,
  onReplace,
}: SignatureLookCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false)

  const outfit = signatureLook?.outfit
  const garments = extractOutfitGarments(outfit)

  const identity = garments.length > 0
    ? garments
        .map((i) => i.displayName)
        .filter(Boolean)
        .join(' · ')
    : 'Signature look'

  const handleReplaceAction = onReplace || onBrowseCollection

  return (
    <section aria-labelledby="signature-look-heading" className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Crown className="size-4" style={{ color: 'var(--studio-accent, #1d1b18)' }} />
            <h2
              id="signature-look-heading"
              className="text-lg font-medium tracking-tight sm:text-xl"
              style={{ color: 'var(--studio-text, #1d1b18)' }}
            >
              My signature look
            </h2>
          </div>
          <p className="mt-0.5 text-xs" style={{ color: 'var(--studio-text-muted, #6d6257)' }}>
            A look that feels like you.
          </p>
        </div>

        {signatureLook && (
          <span
            className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium shadow-2xs"
            style={{
              backgroundColor: 'var(--studio-text, #1d1b18)',
              color: 'var(--studio-bg, #fffdfa)',
            }}
          >
            <Sparkles className="size-3" style={{ color: 'var(--studio-accent)' }} />
            Pinned
          </span>
        )}
      </div>

      {signatureLook && outfit ? (
        <div
          className="overflow-hidden rounded-2xl border p-4 sm:p-5 shadow-xs transition-colors"
          style={{
            backgroundColor: 'var(--studio-surface, #fffdfa)',
            borderColor: 'var(--studio-border, #d8cec2)',
            color: 'var(--studio-text, #1d1b18)',
          }}
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            {/* Compact Thumbnail Tile */}
            <div className="w-full sm:w-36 md:w-40 sm:shrink-0">
              <button
                type="button"
                onClick={() => setDetailsOpen(true)}
                className="group relative block w-full text-left rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2"
                aria-label={`View details for signature look: ${identity}`}
              >
                <OutfitCanvas
                  items={profileGarmentsToWardrobeItems(garments)}
                  identity={identity}
                  variant="thumbnail"
                  className="w-full aspect-4/5"
                />
              </button>
            </div>

            {/* Info and Actions */}
            <div className="flex min-w-0 flex-1 flex-col justify-between self-stretch">
              <div>
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--studio-text-muted, #7a6f62)' }}>
                  <span>
                    Pinned on{' '}
                    {new Date(signatureLook.pinnedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <h3
                  className="mt-1 truncate text-base font-medium tracking-tight sm:text-lg"
                  style={{ color: 'var(--studio-text, #1d1b18)' }}
                  title={identity}
                >
                  {identity}
                </h3>

                {outfit.stylingTip && (
                  <p
                    className="mt-1.5 text-xs italic leading-relaxed"
                    style={{ color: 'var(--studio-text-muted, #6d6257)' }}
                  >
                    Styling tip: &ldquo;{outfit.stylingTip}&rdquo;
                  </p>
                )}
              </div>

              {/* Action buttons matching Design Specification */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDetailsOpen(true)}
                  className="h-8 rounded-full border px-3 text-xs font-medium transition-colors"
                  style={{
                    borderColor: 'var(--studio-border, #d8cec2)',
                    color: 'var(--studio-text, #1d1b18)',
                  }}
                >
                  <Info className="size-3.5" />
                  View details
                </Button>

                {handleReplaceAction && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleReplaceAction}
                    className="h-8 rounded-full border px-3 text-xs font-medium transition-colors"
                    style={{
                      borderColor: 'var(--studio-border, #d8cec2)',
                      color: 'var(--studio-text, #1d1b18)',
                    }}
                  >
                    <RefreshCw className="size-3.5" />
                    Replace
                  </Button>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onUnpin}
                  disabled={isPending}
                  className="h-8 rounded-full px-3 text-xs font-medium transition-colors hover:text-red-700"
                  style={{ color: 'var(--studio-text-muted, #6d6257)' }}
                >
                  {isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                  Unpin
                </Button>
              </div>
            </div>
          </div>

          <OutfitDetailsDialog
            isOpen={detailsOpen}
            outfit={outfit}
            onClose={() => setDetailsOpen(false)}
          />
        </div>
      ) : (
        <div
          className="rounded-2xl border border-dashed p-6 text-center transition-colors"
          style={{
            borderColor: 'var(--studio-border, #d8cec2)',
            backgroundColor: 'var(--studio-surface-muted, rgba(235, 227, 216, 0.3))',
          }}
        >
          <Crown
            className="mx-auto size-6 opacity-40"
            style={{ color: 'var(--studio-text-muted, #6d6257)' }}
          />
          <h3
            className="mt-2 text-sm font-medium"
            style={{ color: 'var(--studio-text, #1d1b18)' }}
          >
            No signature look pinned
          </h3>
          <p
            className="mt-1 text-xs max-w-sm mx-auto"
            style={{ color: 'var(--studio-text-muted, #6d6257)' }}
          >
            Choose a defining combination from your Saved Looks or Worn History to highlight as your personal signature look.
          </p>
          {handleReplaceAction && (
            <div className="mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleReplaceAction}
                className="h-8 rounded-full border px-4 text-xs transition-colors"
                style={{
                  borderColor: 'var(--studio-border, #d8cec2)',
                  color: 'var(--studio-text, #1d1b18)',
                }}
              >
                Browse lookbook archive
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
