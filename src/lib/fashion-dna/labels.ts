/**
 * Single source of truth for mapping raw style-tag keys to
 * human-readable labels.
 *
 * When a new dimension is added to fashion_dna.vector, add one
 * entry here — no other file needs updating.
 */

import type { DnaSignal } from './types'

/** Map of raw tag keys → display labels. */
export const TAG_LABELS: Record<string, string> = {
  minimal: 'Minimal',
  streetwear: 'Streetwear',
  formal: 'Polished',
  bohemian: 'Bohemian',
  edgy: 'Edgy',
  earth_tones: 'Earth tones',
  casual: 'Casual',
  smart_casual: 'Smart casual',
  classic: 'Classic',
  old_money: 'Old money',
  sporty: 'Sporty',
  relaxed: 'Relaxed',
  vintage: 'Vintage',
  trend_forward: 'Trend forward',
}

/**
 * Convert a raw StyleVector (Record<string, number>) into a sorted
 * DnaSignal[] array, ready to hand to the FashionDnaPanel component.
 *
 * Pure function — no Supabase, no React. Safe to call from both server
 * actions and client-side optimistic update paths.
 *
 * @param vector  Raw fashion_dna.vector object.
 * @param topN    Max signals to return (sorted by weight desc).
 * @param category  Optional category tag applied to every signal
 *                  (defaults to "style" for Phase 1).
 */
export function vectorToSignals(
  vector: Record<string, number>,
  topN = 4,
  category = 'style',
): DnaSignal[] {
  return Object.entries(vector)
    .filter(([, weight]) => typeof weight === 'number' && weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([key, weight]) => ({
      key,
      label: TAG_LABELS[key] ?? key.replaceAll('_', ' '),
      weight,
      category,
    }))
}
