'use client'

import { useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import type { WardrobeItem } from '@/src/lib/outfit/engine'
import type { OutfitCanvasVariant } from '@/src/components/outfit/OutfitCanvas'
import { shouldBypassWardrobeImageOptimization } from '@/src/lib/media/image-policy'
import { composeOutfit } from '@/src/lib/outfit/composition'

function FlatLayGarment({ item, isThumbnail }: { item: WardrobeItem; isThumbnail?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const isFailed = Boolean(failedUrl && failedUrl === item.image_url)

  if (isFailed || !item.image_url) {
    return (
      <div
        role="img"
        aria-label={`${item.display_name} image unavailable`}
        data-image-state="error"
        className="flex size-full items-center justify-center rounded-2xl bg-[#ded5ca]/70 text-[#7a6f62]"
      >
        <ImageOff aria-hidden="true" className={isThumbnail ? 'size-3.5' : 'size-5'} strokeWidth={1.4} />
      </div>
    )
  }

  const imageUrl = item.image_url

  return (
    <Image
      src={imageUrl}
      alt={item.display_name}
      fill
      unoptimized={shouldBypassWardrobeImageOptimization(imageUrl)}
      sizes={isThumbnail ? '160px' : '(min-width: 1024px) 16rem, (min-width: 640px) 28vw, 42vw'}
      onError={() => setFailedUrl(imageUrl)}
      className="object-contain"
    />
  )
}

export default function FlatLay({
  items,
  variant,
}: {
  items: WardrobeItem[]
  editorial?: boolean
  variant?: OutfitCanvasVariant
}) {
  const isThumbnail = variant === 'thumbnail'
  const itemCount = Math.min(5, Math.max(2, items.length))
  const thumbnailRatio = 4 / 5
  const mobileRatio = isThumbnail
    ? thumbnailRatio
    : itemCount === 2
      ? 1
      : itemCount === 3
        ? 6 / 5
        : 4 / 3
  const desktopRatio = itemCount <= 3 ? 16 / 9 : 5 / 3
  const mobile = composeOutfit(items, mobileRatio)
  const desktopById = isThumbnail
    ? new Map(mobile.boxes.map((box) => [box.itemId, box]))
    : new Map(composeOutfit(items, desktopRatio).boxes.map((box) => [box.itemId, box]))
  const stageClass = isThumbnail
    ? 'aspect-4/5 size-full max-h-full max-w-full rounded-2xl'
    : itemCount === 2
      ? 'max-w-[40rem] aspect-square sm:aspect-video rounded-[2rem]'
      : itemCount === 3
        ? 'max-w-[42rem] aspect-[6/5] sm:aspect-video rounded-[2rem]'
        : 'max-w-[44rem] aspect-[4/3] sm:aspect-[5/3] rounded-[2rem]'

  if (items.length === 0) {
    return (
      <div
        role="img"
        aria-label="No garments in outfit"
        data-image-state="empty"
        className={`relative mx-auto flex size-full items-center justify-center overflow-hidden rounded-2xl ${
          isThumbnail ? 'bg-transparent' : 'bg-[#ebe3d8]'
        } text-[#7a6f62] ${isThumbnail ? 'aspect-4/5' : 'aspect-square'}`}
      >
        <ImageOff aria-hidden="true" className={isThumbnail ? 'size-4 opacity-60' : 'size-6 opacity-60'} strokeWidth={1.4} />
      </div>
    )
  }

  const itemById = new Map(items.map((item) => [item.id, item]))
  return (
    <div
      aria-label="Outfit pieces"
      data-layout={mobile.family.startsWith('onepiece') ? 'one-piece' : 'separates'}
      data-preset={mobile.family}
      data-density={itemCount <= 3 ? 'compact' : 'full'}
      className={`relative mx-auto w-full overflow-hidden ${
        isThumbnail ? 'bg-transparent' : 'bg-[#ebe3d8]'
      } transition-colors ${stageClass}`}
    >
      {mobile.boxes.map((box) => {
        const item = itemById.get(box.itemId)!
        const desktop = desktopById.get(box.itemId) ?? box
        const style = {
          '--flatlay-x': `${box.x}%`,
          '--flatlay-y': `${box.y}%`,
          '--flatlay-width': `${box.width}%`,
          '--flatlay-height': `${box.height}%`,
          '--flatlay-x-desktop': `${desktop.x}%`,
          '--flatlay-y-desktop': `${desktop.y}%`,
          '--flatlay-width-desktop': `${desktop.width}%`,
          '--flatlay-height-desktop': `${desktop.height}%`,
          zIndex: box.zIndex,
        } as CSSProperties
        return (
          <div
            key={`${item.id}:${item.image_url ?? 'missing'}`}
            data-slot={box.slot}
            data-role={item.layer_role}
            className={`absolute left-[var(--flatlay-x)] top-[var(--flatlay-y)] h-[var(--flatlay-height)] w-[var(--flatlay-width)] ${
              isThumbnail
                ? ''
                : 'sm:left-[var(--flatlay-x-desktop)] sm:top-[var(--flatlay-y-desktop)] sm:h-[var(--flatlay-height-desktop)] sm:w-[var(--flatlay-width-desktop)]'
            }`}
            style={style}
          >
            <FlatLayGarment item={item} isThumbnail={isThumbnail} />
          </div>
        )
      })}
    </div>
  )
}
