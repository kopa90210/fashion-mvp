import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import GarmentCard from './GarmentCard'

vi.mock('next/image', () => ({
  default: ({ src, alt, className }: React.ComponentProps<'img'>) =>
    React.createElement('img', { src, alt, className }),
}))

describe('GarmentCard selectionIndicator modes', () => {
  it('renders badge indicator when selectionIndicator="badge" and selected=true', () => {
    const html = renderToStaticMarkup(
      React.createElement(GarmentCard, {
        image: '/jacket.png',
        name: 'Wool Overshirt',
        category: 'top',
        variant: 'style_reference',
        selected: true,
        selectionIndicator: 'badge',
      }),
    )

    // Has non-circular top-right Selected badge
    expect(html).toContain('Selected')
    expect(html).toContain('bg-[#E8C568]')
    // Has accent border and ring
    expect(html).toContain('border-[#E8C568]')
    // Does NOT render the circular check button
    expect(html).not.toContain('size-6 items-center justify-center rounded-full')
  })

  it('renders no badge and no empty circle when selectionIndicator="badge" and selected=false', () => {
    const html = renderToStaticMarkup(
      React.createElement(GarmentCard, {
        image: '/jacket.png',
        name: 'Wool Overshirt',
        category: 'top',
        variant: 'style_reference',
        selected: false,
        selectionIndicator: 'badge',
      }),
    )

    // No "Selected" text
    expect(html).not.toContain('Selected')
    // No circular button
    expect(html).not.toContain('size-6 items-center justify-center rounded-full')
    // Subtle border
    expect(html).toContain('border-[#38383D]')
  })

  it('preserves circular indicator for backward compatibility when selectionIndicator="circle"', () => {
    const html = renderToStaticMarkup(
      React.createElement(GarmentCard, {
        image: '/shoe.png',
        name: 'Leather loafer',
        role: 'footwear',
        variant: 'wardrobe',
        selected: true,
        selectionMode: true,
        selectionIndicator: 'circle',
      }),
    )

    // Has circular checkmark button
    expect(html).toContain('rounded-full border border-[#1D1B18] bg-[#1D1B18] text-white')
  })
})
