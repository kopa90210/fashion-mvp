import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import OutfitCanvas from './OutfitCanvas'
import type { WardrobeItem } from '@/src/lib/outfit/engine'

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    className,
    unoptimized,
  }: React.ComponentProps<'img'> & { unoptimized?: boolean }) =>
    React.createElement('img', {
      src,
      alt,
      className,
      'data-private-preview': unoptimized ? 'true' : 'false',
    }),
}))

const items: WardrobeItem[] = [
  {
    id: 'dress',
    display_name: 'Midi dress',
    image_url: 'https://images.test/dress.png',
    layer_role: 'one_piece',
    style_tags: { minimal: 0.8 },
  },
  {
    id: 'heels',
    display_name: 'Heels',
    image_url: 'https://images.test/storage/v1/object/sign/private-wardrobe-media/heels.png',
    layer_role: 'footwear',
    style_tags: { formal: 0.7 },
  },
]

describe('OutfitCanvas', () => {
  it('owns composition, identity and explanation while keeping caller controls as a slot', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        OutfitCanvas,
        {
          items,
          identity: 'Midi dress · Heels',
          reasons: ['because you liked clean, simple pieces'],
          variant: 'editorial',
          reasonsDefaultOpen: true,
        },
        React.createElement('button', null, 'Caller action'),
      ),
    )

    expect(html).toContain('aria-label="Outfit canvas"')
    expect(html).toContain('data-variant="editorial"')
    expect(html.indexOf('Outfit pieces')).toBeLessThan(html.indexOf('Midi dress · Heels'))
    expect(html.indexOf('Midi dress · Heels')).toBeLessThan(html.indexOf('Caller action'))
    expect(html.indexOf('Caller action')).toBeLessThan(html.indexOf('Why this works'))
    expect(html).toContain('because you liked clean, simple pieces')
  })

  it('maps presentation variants onto FlatLay without changing garment semantics', () => {
    const editorial = renderToStaticMarkup(
      React.createElement(OutfitCanvas, {
        items,
        identity: 'Editorial look',
        variant: 'editorial',
      }),
    )
    const framed = renderToStaticMarkup(
      React.createElement(OutfitCanvas, {
        items,
        identity: 'Calibration look',
        description: 'Would you wear this?',
        variant: 'framed',
      }),
    )

    expect(editorial).toContain('object-contain')
    expect(framed).toContain('object-contain')
    expect(framed).toContain('data-variant="framed"')
    expect(editorial).toContain('alt="Midi dress"')
    expect(framed).toContain('alt="Midi dress"')
  })

  it('preserves private-media preview behavior through the reusable canvas', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCanvas, {
        items,
        identity: 'Private preview',
        variant: 'editorial',
      }),
    )

    expect(html).toContain('data-private-preview="true"')
  })

  it('gives one-piece outfits a dominant role-aware composition', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCanvas, { items, variant: 'editorial' }),
    )

    expect(html).toContain('data-layout="one-piece"')
    expect(html).toContain('data-slot="one_piece"')
    expect(html).toContain('data-preset="onepiece_2"')
    expect(html).toContain('data-slot="footwear"')
  })

  it('composes separates and accessories without ecommerce card wrappers', () => {
    const separates: WardrobeItem[] = [
      { id: 'top', display_name: 'Silk shirt', image_url: '/top.png', layer_role: 'base_layer', style_tags: {} },
      { id: 'bottom', display_name: 'Trousers', image_url: '/bottom.png', layer_role: 'bottom', style_tags: {} },
      { id: 'shoes', display_name: 'Loafers', image_url: '/shoes.png', layer_role: 'footwear', style_tags: {} },
      { id: 'bag', display_name: 'Leather bag', image_url: '/bag.png', layer_role: 'accessory', style_tags: {} },
    ]
    const html = renderToStaticMarkup(
      React.createElement(OutfitCanvas, { items: separates, variant: 'editorial' }),
    )

    expect(html).toContain('data-layout="separates"')
    expect(html).toContain('data-slot="top"')
    expect(html).toContain('data-role="base_layer"')
    expect(html).toContain('data-slot="bottom"')
    expect(html).toContain('data-slot="accessory_1"')
    expect(html).not.toContain('shadow-md')
  })

  it('renders an accessible, text-free fallback when a garment image is missing', () => {
    const missing: WardrobeItem[] = [
      { id: 'dress', display_name: 'Rust linen dress', image_url: null, layer_role: 'one_piece', style_tags: {} },
      items[1],
    ]
    const html = renderToStaticMarkup(
      React.createElement(OutfitCanvas, { items: missing, variant: 'editorial' }),
    )

    expect(html).toContain('data-image-state="error"')
    expect(html).toContain('aria-label="Rust linen dress image unavailable"')
    expect(html).not.toContain('>Rust linen dress<')
  })

  it('renders dynamic responsive boxes without restoring labels or cards', () => {
    const html = renderToStaticMarkup(React.createElement(OutfitCanvas, { items }))
    expect(html).toContain('data-density="compact"')
    expect(html).toContain('aspect-square')
    expect(html).toContain('sm:aspect-video')
    expect(html).toContain('--flatlay-x')
    expect(html).toContain('--flatlay-x-desktop')
    expect(html).not.toContain('shadow-md')
    expect(html).not.toContain('>Midi dress<')
  })

  it('uses production stage ratios for three-item and fuller looks', () => {
    const thirdItem: WardrobeItem = { id: 'coat', display_name: 'Coat', image_url: '/coat.png', layer_role: 'outerwear', style_tags: {} }
    const accessory: WardrobeItem = { id: 'bag', display_name: 'Bag', image_url: '/bag.png', layer_role: 'accessory', style_tags: {} }
    const secondAccessory: WardrobeItem = { id: 'glasses', display_name: 'Glasses', image_url: '/glasses.png', layer_role: 'accessory', style_tags: {} }
    const three = renderToStaticMarkup(React.createElement(OutfitCanvas, { items: [...items, thirdItem] }))
    const four = renderToStaticMarkup(React.createElement(OutfitCanvas, { items: [...items, thirdItem, accessory] }))
    const five = renderToStaticMarkup(React.createElement(OutfitCanvas, { items: [...items, thirdItem, accessory, secondAccessory] }))

    expect(three).toContain('aspect-[6/5]')
    expect(three).toContain('sm:aspect-video')
    for (const html of [four, five]) {
      expect(html).toContain('aspect-[4/3]')
      expect(html).toContain('sm:aspect-[5/3]')
      expect(html).toContain('data-density="full"')
    }
  })

  it('renders a compact thumbnail variant without identity text or why-this explainer', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCanvas, {
        items,
        identity: 'Thumbnail look',
        description: 'Should not appear in thumbnail',
        reasons: ['Reason should not show'],
        variant: 'thumbnail',
      }),
    )

    expect(html).toContain('data-variant="thumbnail"')
    expect(html).toContain('aspect-4/5')
    expect(html).toContain('size-full')
    expect(html).not.toContain('sm:aspect-video')
    expect(html).not.toContain('Thumbnail look')
    expect(html).not.toContain('Should not appear in thumbnail')
    expect(html).not.toContain('Reason should not show')
  })

  it('produces nonzero dimension boxes and garment nodes for jumpsuit + footwear thumbnail', () => {
    const jumpsuitLook: WardrobeItem[] = [
      { id: 'jumpsuit', display_name: 'Black Jumpsuit', image_url: '/jumpsuit.png', layer_role: 'one_piece', style_tags: {} },
      { id: 'pumps', display_name: 'Black Pumps', image_url: '/pumps.png', layer_role: 'footwear', style_tags: {} },
    ]

    const html = renderToStaticMarkup(
      React.createElement(OutfitCanvas, {
        items: jumpsuitLook,
        variant: 'thumbnail',
      }),
    )

    expect(html).toContain('data-slot="one_piece"')
    expect(html).toContain('data-slot="footwear"')
    expect(html).toContain('alt="Black Jumpsuit"')
    expect(html).toContain('alt="Black Pumps"')
    // Nonzero coordinate styles
    expect(html).toContain('--flatlay-width')
    expect(html).toContain('--flatlay-height')
    expect(html).not.toContain('--flatlay-width:0%')
    expect(html).not.toContain('--flatlay-height:0%')
    expect(html).not.toContain('NaN')
  })

  it('renders an accessible empty placeholder when outfit has no items', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCanvas, {
        items: [],
        variant: 'thumbnail',
      }),
    )

    expect(html).toContain('data-image-state="empty"')
    expect(html).toContain('aria-label="No garments in outfit"')
  })
})
