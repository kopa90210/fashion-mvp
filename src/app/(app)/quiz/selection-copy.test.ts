import { describe, expect, it } from 'vitest'
import { STYLE_SELECTION_COPY } from './selection-copy'

describe('curated selection product language', () => {
  it('uses explicit owned-similar language throughout piece selection', () => {
    expect(STYLE_SELECTION_COPY.title).toBe('What’s already in your wardrobe?')
    expect(STYLE_SELECTION_COPY.description).toBe('Choose pieces similar to clothes you own. They don’t need to match exactly.')
    expect(STYLE_SELECTION_COPY.selectedCardLabel).toBe('I own something similar')
    expect(STYLE_SELECTION_COPY.emptySelection).toBe('None of these')
    expect(STYLE_SELECTION_COPY.continueWithCount(3)).toBe('Continue with 3 pieces')
  })

  it('explains delayed commitment', () => {
    expect(STYLE_SELECTION_COPY.submitBody).toContain('after calibration')
  })
})
