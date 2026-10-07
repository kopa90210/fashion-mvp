import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}))

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  motion: new Proxy(
    {},
    {
      get: (_target, tag: string) =>
        ({ children, ...props }: React.ComponentProps<'div'>) =>
          React.createElement(tag, props, children),
    },
  ),
}))

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) =>
    React.createElement('span', null, children),
}))

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) =>
    React.createElement('button', props, children),
}))

vi.mock('@/src/app/actions/outfit', () => ({
  submitCalibrationFeedback: vi.fn(),
  skipOutfitCalibration: vi.fn(),
}))

vi.mock('@/src/components/fashion-dna/FashionDnaPanel', () => ({
  default: () => React.createElement('aside', null, 'Fashion DNA'),
}))

vi.mock('@/src/components/outfit/OutfitCanvas', () => ({
  default: ({
    identity,
    description,
    children,
  }: {
    identity?: string
    description?: string
    children?: React.ReactNode
  }) =>
    React.createElement(
      'section',
      { 'aria-label': 'Outfit canvas' },
      identity ? React.createElement('h2', null, identity) : null,
      description ? React.createElement('p', null, description) : null,
      children,
    ),
}))

import OutfitCalibrationScreen from './OutfitCalibrationScreen'

const outfit = {
  id: 'calibration-1',
  score: 0.9,
  vector: { minimal: 0.7 },
  reasons: ['because you liked clean pieces'],
  items: [
    {
      id: 'dress',
      display_name: 'Midi dress',
      image_url: '/dress.png',
      layer_role: 'one_piece' as const,
      style_tags: { minimal: 0.8 },
    },
    {
      id: 'heels',
      display_name: 'Heels',
      image_url: '/heels.png',
      layer_role: 'footwear' as const,
      style_tags: { formal: 0.6 },
    },
  ],
}

describe('calibration UX semantics', () => {
  it('shows a three-look style check with explicit preference choices', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCalibrationScreen, {
        outfit,
        answeredCount: 0,
        feedbackCount: 0,
      }),
    )

    expect(html).toContain('Style check')
    expect(html).toContain('What feels like you?')
    expect(html).toContain('Look 1 of 3')
    expect(html).toContain('Would you wear this?')
    expect(html).toContain('Not my style')
    expect(html).toContain('Love this')
    expect(html).toContain('teaches StyleGraph what to recommend next')
  })

  it('does not expose wear/not-today behavior inside calibration', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCalibrationScreen, {
        outfit,
        answeredCount: 1,
        feedbackCount: 3,
      }),
    )

    expect(html).toContain('Look 2 of 3')
    expect(html).not.toContain("I'm wearing this")
    expect(html).not.toContain('Not today')
    expect(html).not.toContain('Swap something')
  })
})
