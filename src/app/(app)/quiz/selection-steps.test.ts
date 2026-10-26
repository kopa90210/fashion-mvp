import { describe, expect, it } from 'vitest'
import { isCalibrationSelectionEligible, SELECTION_STEPS } from './selection-steps'

describe('calibration selection eligibility', () => {
  it('accepts two one-pieces and two footwear options', () => {
    expect(isCalibrationSelectionEligible({ one_piece: 2, footwear: 2 })).toBe(true)
  })

  it('accepts two tops, two bottoms, and two footwear options', () => {
    expect(isCalibrationSelectionEligible({ top: 2, bottom: 2, footwear: 2 })).toBe(true)
  })

  it('does not force ownership to satisfy calibration composition', () => {
    expect(SELECTION_STEPS.every((step) => !step.required)).toBe(true)
  })

  it('includes a dedicated one-piece selection step', () => {
    expect(SELECTION_STEPS.map((step) => step.category)).toEqual([
      'top', 'bottom', 'one_piece', 'footwear', 'outerwear', 'accessory',
    ])
  })
})
