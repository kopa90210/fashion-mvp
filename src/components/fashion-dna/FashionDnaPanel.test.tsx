import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import FashionDnaPanel from './FashionDnaPanel'

describe('FashionDnaPanel', () => {
  it('shows only the strongest four human-readable signals without technical weights', () => {
    const html = renderToStaticMarkup(
      React.createElement(FashionDnaPanel, {
        feedbackCount: 2,
        signals: [
          { key: 'minimal', label: 'Minimal', weight: 0.9 },
          { key: 'casual', label: 'Casual', weight: 0.8 },
          { key: 'formal', label: 'Polished', weight: 0.7 },
          { key: 'earth', label: 'Earth tones', weight: 0.6 },
          { key: 'edgy', label: 'Edgy', weight: 0.5 },
        ],
      }),
    )

    expect(html).toContain('Your style is taking shape')
    expect(html).toContain('Updated after every choice.')
    expect(html).toContain('Minimal')
    expect(html).toContain('Earth tones')
    expect(html).not.toContain('Edgy')
    expect(html).not.toContain('90%')
    expect(html).not.toContain('weights')
    expect(html).toContain('motion-reduce:transition-none')
  })
})
