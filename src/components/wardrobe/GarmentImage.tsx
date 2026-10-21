'use client'

import { useState } from 'react'
import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import { shouldBypassWardrobeImageOptimization } from '@/src/lib/media/image-policy'

export function formatGarmentRole(role?: string | null) {
  if (role === 'base_layer') return 'Top'
  if (role === 'one_piece') return 'One piece'
  return role ? role.replaceAll('_', ' ') : 'Garment'
}

export default function GarmentImage({
  src,
  alt,
  label,
  role,
  sizes = '(min-width: 1024px) 320px, 70vw',
  className = 'object-contain p-3',
}: {
  src: string | null | undefined
  alt: string
  label?: string
  role?: string | null
  sizes?: string
  className?: string
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    src ? 'loading' : 'error',
  )
  const fallbackLabel = label?.trim() || alt || formatGarmentRole(role)

  return (
    <div className="relative size-full" data-image-state={status}>
      {status === 'loading' ? (
        <div aria-hidden="true" className="absolute inset-[8%] animate-pulse rounded-[1.5rem] bg-[#ded5ca]/65 motion-reduce:animate-none" />
      ) : null}
      {src && status !== 'error' ? (
        <Image
          src={src}
          alt={alt}
          fill
          unoptimized={shouldBypassWardrobeImageOptimization(src)}
          sizes={sizes}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={`transition-opacity duration-300 motion-reduce:transition-none ${className} ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      ) : null}
      {status === 'error' ? (
        <div
          role="img"
          aria-label={`${fallbackLabel} image unavailable`}
          className="absolute inset-[8%] flex flex-col items-center justify-center rounded-[1.5rem] border border-[#d8cec2]/80 bg-[#f7f4ef]/75 px-3 text-center text-[#6d6257]"
        >
          <ImageOff aria-hidden="true" className="size-6" strokeWidth={1.4} />
          <span className="mt-2 text-xs font-medium leading-4">{fallbackLabel}</span>
          <span className="mt-1 text-[10px] capitalize text-[#8c7f72]">{formatGarmentRole(role)}</span>
        </div>
      ) : null}
    </div>
  )
}
