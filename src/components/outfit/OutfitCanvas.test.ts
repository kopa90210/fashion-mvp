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
    expect(framed).toContain('object-cover')
    expect(framed).toContain('data-variant="framed"')
    expect(editorial).toContain('Midi dress')
    expect(framed).toContain('Midi dress')
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
})
