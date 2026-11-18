'use client'

import { Shirt, Bookmark, Calendar } from 'lucide-react'
import type { ProfileCounts } from '@/src/lib/profile/types'

interface ProfileStatsProps {
  counts: ProfileCounts
}

export default function ProfileStats({ counts }: ProfileStatsProps) {
  const pieces = counts.wardrobePieces !== null ? counts.wardrobePieces : null
  const saved = counts.savedLooks !== null ? counts.savedLooks : null
  const worn = counts.timesWorn !== null ? counts.timesWorn : null

  return (
    <section aria-label="Wardrobe summary statistics" className="mt-6 mb-8">
      <div className="flex flex-wrap items-center gap-y-2 text-xs sm:text-sm text-[#6D6257]">
        {/* Pieces */}
        <div className="flex items-center gap-1.5">
          <Shirt aria-hidden="true" className="size-4 text-[#1D1B18]" />
          <span
            aria-label={
              pieces !== null
                ? `${pieces} wardrobe pieces`
                : 'Wardrobe pieces count unavailable'
            }
            className="font-semibold text-[#1D1B18]"
          >
            {pieces !== null ? pieces : '—'}
          </span>
          <span>{pieces === 1 ? 'piece' : 'pieces'}</span>
        </div>

        <span aria-hidden="true" className="mx-3.5 select-none text-[#D8CEC2]">
          |
        </span>

        {/* Saved Looks */}
        <div className="flex items-center gap-1.5">
          <Bookmark aria-hidden="true" className="size-4 text-[#1D1B18]" />
          <span
            aria-label={
              saved !== null
                ? `${saved} saved looks`
                : 'Saved looks count unavailable'
            }
            className="font-semibold text-[#1D1B18]"
          >
            {saved !== null ? saved : '—'}
          </span>
          <span>{saved === 1 ? 'saved look' : 'saved looks'}</span>
        </div>

        <span aria-hidden="true" className="mx-3.5 select-none text-[#D8CEC2]">
          |
        </span>

        {/* Times Worn */}
        <div className="flex items-center gap-1.5">
          <Calendar aria-hidden="true" className="size-4 text-[#1D1B18]" />
          <span
            aria-label={
              worn !== null
                ? `${worn} times worn`
                : 'Times worn count unavailable'
            }
            className="font-semibold text-[#1D1B18]"
          >
            {worn !== null ? worn : '—'}
          </span>
          <span>worn</span>
        </div>
      </div>
    </section>
  )
}
