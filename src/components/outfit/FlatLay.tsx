'use client'

import { useState, type CSSProperties } from 'react'
import Image from 'next/image'
import { ImageOff } from 'lucide-react'
import type { WardrobeItem } from '@/src/lib/outfit/engine'
import { shouldBypassWardrobeImageOptimization } from '@/src/lib/media/image-policy'
import { composeOutfit } from '@/src/lib/outfit/composition'

function FlatLayGarment({ item }: { item: WardrobeItem }) {
  const [failed, setFailed] = useState(!item.image_url)
  if (failed || !item.image_url) return <div role="img" aria-label={`${item.display_name} image unavailable`} data-image-state="error" className="flex size-full items-center justify-center rounded-full bg-[#ded5ca]/70 text-[#7a6f62]"><ImageOff aria-hidden="true" className="size-5" strokeWidth={1.4} /></div>
  return <Image src={item.image_url} alt={item.display_name} fill unoptimized={shouldBypassWardrobeImageOptimization(item.image_url)} sizes="(min-width: 1024px) 16rem, (min-width: 640px) 28vw, 42vw" onError={() => setFailed(true)} className="object-contain" />
}

export default function FlatLay({ items, editorial: _editorial = false }: { items: WardrobeItem[]; editorial?: boolean }) {
  const itemCount = Math.min(5, Math.max(2, items.length))
  const mobileRatio = itemCount === 2 ? 1 : itemCount === 3 ? 6 / 5 : 4 / 3
  const desktopRatio = itemCount <= 3 ? 16 / 9 : 5 / 3
  const mobile = composeOutfit(items, mobileRatio)
  const desktopById = new Map(composeOutfit(items, desktopRatio).boxes.map((box) => [box.itemId, box]))
  const stageClass = itemCount === 2
    ? 'max-w-[40rem] aspect-square sm:aspect-video'
    : itemCount === 3
      ? 'max-w-[42rem] aspect-[6/5] sm:aspect-video'
      : 'max-w-[44rem] aspect-[4/3] sm:aspect-[5/3]'
  const itemById = new Map(items.map((item) => [item.id, item]))
  return <div aria-label="Outfit pieces" data-layout={mobile.family.startsWith('onepiece') ? 'one-piece' : 'separates'} data-preset={mobile.family} data-density={itemCount <= 3 ? 'compact' : 'full'} className={`relative mx-auto w-full overflow-hidden rounded-[2rem] bg-[#ebe3d8] ${stageClass}`}>
    {mobile.boxes.map((box) => {
      const item = itemById.get(box.itemId)!
      const desktop = desktopById.get(box.itemId) ?? box
      const style = {
        '--flatlay-x': `${box.x}%`, '--flatlay-y': `${box.y}%`, '--flatlay-width': `${box.width}%`, '--flatlay-height': `${box.height}%`,
        '--flatlay-x-desktop': `${desktop.x}%`, '--flatlay-y-desktop': `${desktop.y}%`, '--flatlay-width-desktop': `${desktop.width}%`, '--flatlay-height-desktop': `${desktop.height}%`,
        zIndex: box.zIndex,
      } as CSSProperties
      return <div key={`${item.id}:${item.image_url ?? 'missing'}`} data-slot={box.slot} data-role={item.layer_role} className="absolute left-[var(--flatlay-x)] top-[var(--flatlay-y)] h-[var(--flatlay-height)] w-[var(--flatlay-width)] sm:left-[var(--flatlay-x-desktop)] sm:top-[var(--flatlay-y-desktop)] sm:h-[var(--flatlay-height-desktop)] sm:w-[var(--flatlay-width-desktop)]" style={style}><FlatLayGarment item={item} /></div>
    })}
  </div>
}
