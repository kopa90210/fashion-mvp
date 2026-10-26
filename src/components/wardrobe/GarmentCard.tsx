'use client'

import { Check } from 'lucide-react'
import GarmentImage from './GarmentImage'

type GarmentCardVariant = 'style_reference' | 'wardrobe'

function presentationRole(role?: string | null, category?: string | null) {
  if (role) return role
  if (category === 'top') return 'base_layer'
  return category || 'accessory'
}

export default function GarmentCard({
  image,
  imageAlt,
  name,
  category,
  role,
  brand,
  metadata,
  selectionLabel,
  badge,
  variant,
  selected = false,
  selectionMode = false,
  quantity = 1,
}: {
  image: string | null
  imageAlt?: string
  name: string
  category?: string | null
  role?: string | null
  brand?: string | null
  metadata?: string | null
  selectionLabel?: string
  badge?: string
  variant: GarmentCardVariant
  selected?: boolean
  selectionMode?: boolean
  quantity?: number
}) {
  const resolvedRole = presentationRole(role, category)
  const stageClass = resolvedRole === 'one_piece'
    ? 'aspect-[3/4]'
    : resolvedRole === 'footwear'
      ? 'aspect-[4/3]'
      : resolvedRole === 'accessory'
        ? 'aspect-square'
        : 'aspect-[4/5]'
  const imageClass = resolvedRole === 'footwear'
    ? 'object-contain p-4 sm:p-6'
    : resolvedRole === 'accessory'
      ? 'object-contain p-6 sm:p-8'
      : 'object-contain p-2 sm:p-3'
  const reference = variant === 'style_reference'

  return (
    <article
      data-garment-card={variant}
      data-role={resolvedRole}
      className={`min-w-0 overflow-hidden rounded-2xl border transition-colors ${
        reference
          ? selected ? 'border-amber-300 bg-white/10 ring-2 ring-amber-300/30' : 'border-white/10 bg-white/5'
          : selected ? 'border-[#1D1B18] bg-[#FFFDFA] ring-1 ring-[#1D1B18]' : 'border-transparent'
      }`}
    >
      <div className={`relative overflow-hidden ${stageClass} ${reference ? 'bg-white/5' : 'bg-[#EBE3D8]'}`}>
        <GarmentImage
          src={image}
          alt={imageAlt ?? (reference ? `Example image of ${name}` : name)}
          label={name}
          role={resolvedRole}
          sizes={reference ? '(min-width: 768px) 180px, 40vw' : '(min-width: 1280px) 210px, (min-width: 768px) 28vw, 45vw'}
          className={`${imageClass} transition-transform duration-300 motion-safe:group-hover:scale-[1.03]`}
        />
        {quantity > 1 ? <span className="absolute right-2 top-2 rounded-full bg-[#FFFDFA] px-2 py-1 text-[11px] font-medium text-[#1D1B18] shadow-sm">{quantity} pieces</span> : null}
        {badge ? <span className="absolute bottom-2 left-2 rounded-full bg-[#FFFDFA] px-2.5 py-1 text-[10px] font-medium text-[#1D1B18] shadow-sm">{badge}</span> : null}
        {(selectionMode || selected) ? (
          <span aria-hidden="true" className={`absolute left-3 top-3 flex size-6 items-center justify-center rounded-full border ${selected ? 'border-[#1D1B18] bg-[#1D1B18] text-white' : reference ? 'border-white/40 bg-black/20 text-transparent' : 'border-[#D8CEC2] bg-[#FFFDFA] text-transparent'}`}>
            <Check className="size-4" />
          </span>
        ) : null}
          {reference && selected && selectionLabel ? <span aria-hidden="true" className="absolute inset-x-2 bottom-2 rounded-lg bg-black/75 px-2 py-1 text-center text-[10px] leading-3 text-white">{selectionLabel}</span> : null}
      </div>
      <div className={reference ? 'p-3 text-white' : 'px-0 pb-1 pt-3 text-[#1D1B18]'}>
        {brand ? <p className={`truncate text-[11px] uppercase tracking-[0.12em] ${reference ? 'text-white/45' : 'text-[#6D6257]'}`}>{brand}</p> : null}
        <h3 className="truncate text-sm font-medium">{name}</h3>
        {metadata ? <p className={`mt-1 truncate text-xs ${reference ? 'text-white/55' : 'text-[#6D6257]'}`}>{metadata}</p> : null}
      </div>
    </article>
  )
}
