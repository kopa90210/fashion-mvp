export type PipelineStep = {
  category: string
  label: string
  required: boolean
  minSelections: number
}

/** Ownership choices are optional in every category. */
export const SELECTION_STEPS: PipelineStep[] = [
  { category: 'top', label: 'Tops', required: false, minSelections: 0 },
  { category: 'bottom', label: 'Bottoms', required: false, minSelections: 0 },
  { category: 'one_piece', label: 'Dresses & one-pieces', required: false, minSelections: 0 },
  { category: 'footwear', label: 'Footwear', required: false, minSelections: 0 },
  { category: 'outerwear', label: 'Outerwear', required: false, minSelections: 0 },
  { category: 'accessory', label: 'Accessories', required: false, minSelections: 0 },
]

export type SelectionCounts = Partial<Record<string, number>>

/** Composition check for calibration examples, never an ownership gate. */
export function isCalibrationSelectionEligible(counts: SelectionCounts): boolean {
  const hasFootwear = (counts.footwear ?? 0) >= 2
  const hasSeparates = (counts.top ?? 0) >= 2 && (counts.bottom ?? 0) >= 2
  const hasOnePieces = (counts.one_piece ?? 0) >= 2
  return hasFootwear && (hasSeparates || hasOnePieces)
}
