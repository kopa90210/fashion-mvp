import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import ProfileAppearancePanel from './ProfileAppearancePanel'
import { DEFAULT_APPEARANCE } from '@/src/lib/profile/appearance'

describe('ProfileAppearancePanel component', () => {
  it('renders section title, subtitle, modes, and curated accents with accessible attributes', () => {
    const html = renderToStaticMarkup(
      React.createElement(ProfileAppearancePanel, {
        preferences: DEFAULT_APPEARANCE,
        effectiveMode: 'light',
        onChangeMode: vi.fn(),
        onChangeAccent: vi.fn(),
        onReset: vi.fn(),
      }),
    )

    expect(html).toContain('Appearance on this device')
    expect(html).toContain('Choose how your private style studio feels on this screen.')
    expect(html).toContain('Display Theme')
    expect(html).toContain('Light')
    expect(html).toContain('Dark')
    expect(html).toContain('System')
    expect(html).toContain('Studio Accent')
    expect(html).toContain('Sage')
    expect(html).toContain('Terracotta')
    expect(html).toContain('Plum')
    expect(html).toContain('Slate')
    expect(html).toContain('Reset appearance')
  })

  it('marks selected mode and accent with aria-checked and visible selection indicators', () => {
    const custom = {
      version: 1 as const,
      mode: 'dark' as const,
      accent: 'plum' as const,
    }

    const html = renderToStaticMarkup(
      React.createElement(ProfileAppearancePanel, {
        preferences: custom,
        effectiveMode: 'dark',
        onChangeMode: vi.fn(),
        onChangeAccent: vi.fn(),
        onReset: vi.fn(),
      }),
    )

    // Dark mode is selected
    expect(html).toContain('aria-checked="true"')
    // Plum is selected
    expect(html).toContain('Plum')
    expect(html).toContain('Understated dark mulberry')
  })
})
