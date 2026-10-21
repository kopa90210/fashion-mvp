import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import GarmentCard from './GarmentCard'

vi.mock('next/image', () => ({ default: ({ src, alt, className }: React.ComponentProps<'img'>) => React.createElement('img', { src, alt, className }) }))

describe('GarmentCard', () => {
  it('renders the curated style-reference variant without ownership controls', () => {
    const html = renderToStaticMarkup(<GarmentCard image="/dress.png" name="Silk dress" category="one_piece" variant="style_reference" selected selectionMode />)
    expect(html).toContain('data-garment-card="style_reference"')
    expect(html).toContain('data-role="one_piece"')
    expect(html).toContain('Silk dress')
    expect(html).not.toContain('Remove')
  })

  it('renders wardrobe selection, quantity and footwear presentation', () => {
    const html = renderToStaticMarkup(<GarmentCard image="/shoe.png" name="Leather loafer" role="footwear" brand="Acme" metadata="Loafers" variant="wardrobe" selected selectionMode quantity={2} />)
    expect(html).toContain('data-garment-card="wardrobe"')
    expect(html).toContain('data-role="footwear"')
    expect(html).toContain('aspect-[4/3]')
    expect(html).toContain('2 pieces')
    expect(html).toContain('Acme')
  })

  it('uses the neutral image fallback and tall one-piece stage', () => {
    const html = renderToStaticMarkup(<GarmentCard image={null} name="Black dress" role="one_piece" variant="wardrobe" />)
    expect(html).toContain('aspect-[3/4]')
    expect(html).toContain('Black dress image unavailable')
    expect(html).not.toContain('src=')
  })
})
