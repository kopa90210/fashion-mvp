import Image from 'next/image'
import type { WardrobeItem } from '@/src/lib/outfit/engine'

const zones: Record<string, { top: string; left: string; width: string; zIndex: number }> = {
  base_layer: { top: '4%', left: '29%', width: '42%', zIndex: 2 },
  bottom: { top: '39%', left: '31%', width: '38%', zIndex: 1 },
  footwear: { top: '70%', left: '22%', width: '56%', zIndex: 4 },
  outerwear: { top: '8%', left: '10%', width: '38%', zIndex: 3 },
  accessory: { top: '54%', left: '68%', width: '20%', zIndex: 5 },
}

export default function FlatLay({ items }: { items: WardrobeItem[] }) {
  return <div className="relative aspect-[4/5] overflow-hidden rounded-lg border border-[#d8cec2] bg-[#ebe3d8]">
    {items.map((item, index) => {
      const zone = zones[item.layer_role] ?? { top: `${8 + index * 8}%`, left: '25%', width: '45%', zIndex: index + 1 }
      return <div key={item.id} className="absolute overflow-hidden rounded-lg border border-[#ded5ca] bg-[#fbfaf7] shadow-md" style={zone}>
        <div className="relative aspect-[4/5]">
          {item.image_url ? <Image src={item.image_url} alt={item.display_name} fill sizes="(min-width: 1024px) 260px, 55vw" className="object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-[#7a6f62]">No image</div>}
        </div>
        <p className="truncate px-2 py-1.5 text-center text-xs font-medium">{item.display_name}</p>
      </div>
    })}
  </div>
}