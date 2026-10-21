import type { ReactNode } from 'react'
import type { WardrobeItem } from '@/src/lib/outfit/engine'
import FlatLay from '@/src/components/outfit/FlatLay'
import WhyThisExplainer from '@/src/components/outfit/WhyThisExplainer'

export type OutfitCanvasVariant = 'editorial' | 'framed'

export interface OutfitCanvasProps {
  items: WardrobeItem[]
  identity?: string
  description?: string
  reasons?: string[]
  variant?: OutfitCanvasVariant
  reasonsDefaultOpen?: boolean
  children?: ReactNode
  className?: string
}

/**
 * Pure outfit presentation.
 *
 * It knows how an outfit is composed visually, but it deliberately knows
 * nothing about calibration, Supabase, Fashion DNA writes, wear decisions,
 * swaps, or navigation. Callers provide those controls through `children`.
 */
export default function OutfitCanvas({
  items,
  identity,
  description,
  reasons,
  variant = 'editorial',
  reasonsDefaultOpen = false,
  children,
  className = '',
}: OutfitCanvasProps) {
  const framed = variant === 'framed'

  const identityBlock = identity || description ? (
    <div className="mt-6">
      {identity ? (
        <h2 className={framed ? 'text-xl font-medium' : 'text-xl font-medium sm:text-2xl'}>
          {identity}
        </h2>
      ) : null}
      {description ? (
        <p className="mt-2 text-sm leading-6 text-[#6d6257]">
          {description}
        </p>
      ) : null}
    </div>
  ) : null

  return (
    <section
      aria-label="Outfit canvas"
      data-variant={variant}
      className={[
        framed ? 'rounded-[2rem] bg-[#fffdfa]/55 p-3 sm:p-5' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      <FlatLay items={items} />

      {identityBlock}

      {children}

      {reasons !== undefined ? (
        <div className={framed ? 'mt-5 border-t border-[#e4dbd0] pt-4' : 'mt-7'}>
          <WhyThisExplainer
            reasons={reasons}
            defaultOpen={reasonsDefaultOpen}
          />
        </div>
      ) : null}
    </section>
  )
}
