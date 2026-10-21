import { describe, expect, it } from 'vitest'
import { STYLE_SELECTION_COPY } from './selection-copy'

describe('curated selection product language', () => {
  it('treats curated picks as style references rather than owned wardrobe items', () => {
    expect(STYLE_SELECTION_COPY.referenceNote).toContain('style references')
    expect(STYLE_SELECTION_COPY.referenceNote).toContain("won't be added to your wardrobe")
    expect(STYLE_SELECTION_COPY.optionalHint).not.toMatch(/you own/i)
  })

  it('hands the user into calibration instead of claiming to build a wardrobe', () => {
    expect(STYLE_SELECTION_COPY.finalCta).toBe('Start style check')
    expect(STYLE_SELECTION_COPY.submitTitle).toBe('Learning your style...')
    expect(STYLE_SELECTION_COPY.submitBody).toContain('three quick looks')
    expect(STYLE_SELECTION_COPY.finalCta).not.toMatch(/wardrobe/i)
    expect(STYLE_SELECTION_COPY.submitTitle).not.toMatch(/wardrobe/i)
  })
})
