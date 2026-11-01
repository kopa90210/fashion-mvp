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
  useReducedMotion: () => true,
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

vi.mock('@/src/components/outfit/OutfitCanvas', () => ({
  default: ({
    identity,
    description,
    reasons,
    children,
  }: {
    identity?: string
    description?: string
    reasons?: string[]
    children?: React.ReactNode
  }) =>
    React.createElement(
      'section',
      { 'aria-label': 'Outfit canvas' },
      identity ? React.createElement('h2', null, identity) : null,
      description ? React.createElement('p', null, description) : null,
      reasons?.map((reason, i) => React.createElement('p', { key: i }, reason)),
      children,
    ),
}))

import OutfitCalibrationScreen from './OutfitCalibrationScreen'
import CalibrationLoading from './loading'
import CalibrationError from './error'

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
  it('shows refined copy hierarchy with explicit feedback choices and warm presentation', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCalibrationScreen, {
        outfit,
        answeredCount: 0,
        target: 3,
        feedbackCount: 0,
      }),
    )

    // Heading and prompt hierarchy
    expect(html).toContain('Let’s tune your style.')
    expect(html).toContain('Would you wear this?')
    expect(html).toContain('This helps us learn your taste.')

    // Progress badge
    expect(html).toContain('Look 1 of 3')

    // Refined feedback actions
    expect(html).toContain('Not for me')
    expect(html).toContain('I’d wear this')
  })

  it('does not expose wear/not-today behavior inside calibration', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCalibrationScreen, {
        outfit,
        answeredCount: 1,
        target: 3,
        feedbackCount: 3,
      }),
    )

    expect(html).toContain('Look 2 of 3')
    expect(html).not.toContain("I'm wearing this")
    expect(html).not.toContain('Not today')
    expect(html).not.toContain('Swap something')
  })

  it.each([
    [0, 3, 'Look 1 of 3', 1],
    [1, 3, 'Look 2 of 3', 2],
    [2, 3, 'Look 3 of 3', 3],
    [3, 3, 'Look 3 of 3', 3], // Clamped upon completion, never Look 4 of 3
  ])('announces real progress for answered count %i with target %i as %s', (answeredCount, target, label, expectedNow) => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCalibrationScreen, {
        outfit,
        answeredCount,
        target,
        feedbackCount: answeredCount,
      }),
    )

    expect(html).toContain(label)
    expect(html).toContain(`aria-valuenow="${expectedNow}"`)
    expect(html).toContain(`aria-valuemax="${target}"`)
    expect(html).not.toContain(`Look ${target + 1} of ${target}`)
  })

  it('derives progress dynamically when given a non-default target', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCalibrationScreen, {
        outfit,
        answeredCount: 1,
        target: 5,
        feedbackCount: 1,
      }),
    )

    expect(html).toContain('Look 2 of 5')
    expect(html).toContain('aria-valuemax="5"')
    expect(html).toContain('aria-valuenow="2"')
  })

  it('hides distractions like Fashion DNA and Why this works, focusing on outfit and feedback', () => {
    const html = renderToStaticMarkup(
      React.createElement(OutfitCalibrationScreen, {
        outfit,
        answeredCount: 0,
        target: 3,
        feedbackCount: 0,
      }),
    )

    // Distractions removed
    expect(html).not.toContain('Fashion DNA')
    expect(html).not.toContain('because you liked clean pieces')
    expect(html).not.toContain('Why this works')

    // Clean single-column layout without 2-column grid or bottom-nav spacer gap
    expect(html).not.toContain('lg:grid-cols-[minmax(0,7fr)_minmax(17rem,3fr)]')
    expect(html).not.toContain('5.75rem')
    expect(html).toContain('max-w-lg')
    expect(html).toContain('I’d wear this')
    expect(html).toContain('Not for me')
  })
})

describe('calibration route resilience', () => {
  it('renders an editorial loading state matching the final composition', () => {
    const html = renderToStaticMarkup(React.createElement(CalibrationLoading))

    expect(html).toContain('aria-label="Loading style check"')
    expect(html).toContain('Loading your next style-check look.')
    expect(html).toContain('h-[clamp(28rem,68vw,42rem)]')
    expect(html).toContain('motion-reduce:animate-none')
  })

  it('shows a generic retryable route error without exposing details', () => {
    const html = renderToStaticMarkup(
      React.createElement(CalibrationError, {
        error: new Error('sensitive backend detail'),
        reset: vi.fn(),
      }),
    )

    expect(html).toContain('We couldn&#x27;t load this look.')
    expect(html).toContain('Retry')
    expect(html).not.toContain('sensitive backend detail')
  })
})
