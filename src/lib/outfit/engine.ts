/**
 * Outfit Recommendation Engine
 *
 * Pure module — no Supabase, no React, no model calls.
 * Takes a user's wardrobe items + their fashion DNA vector and returns
 * the top N ranked outfit combinations.
 *
 * Outfit validity rules (layer_role):
 *   Required : exactly one 'base_layer'  (tops, shirts, blouses, etc.)
 *   Required : exactly one 'bottom'      (pants, skirts, shorts, etc.)
 *   Required : exactly one 'footwear'
 *   Optional : zero or one 'outerwear'   (jacket, coat, etc.)
 *   Optional : zero or one 'accessory'
 *
 * Scoring: normalised dot-product of each item's style_tags against the
 * user's fashion DNA vector, averaged across all items in the outfit.
 * Result ∈ [0, 1].
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

import type { StyleVector } from '@/src/lib/quiz/scoring';

/** The layer_role values stored on wardrobe_items. */
export type LayerRole =
  | 'base_layer'
  | 'bottom'
  | 'footwear'
  | 'outerwear'
  | 'accessory';

/** Minimal wardrobe item shape required by the engine. */
export interface WardrobeItem {
  id: string;
  display_name: string;
  image_url: string | null;
  layer_role: LayerRole;
  /** Partial style vector — only dimensions this item expresses. */
  style_tags: Partial<StyleVector>;
}

/** A valid outfit and its score. */
export interface Outfit {
  /** The items that make up this outfit, in slot order. */
  items: WardrobeItem[];
  /**
   * Normalised aggregate style score ∈ [0, 1], rounded to 4 dp.
   * This is a numeric measure only — all interpretive copy lives in the UI.
   */
  score: number;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Score a single item against a fashion DNA vector.
 *
 * Uses a normalised dot product (cosine similarity) so that items with
 * more style_tags do not automatically outscore sparse items.
 *
 * score = dot(item.style_tags, dna) / (|item.style_tags| * |dna|)
 *
 * If either vector has zero magnitude, returns 0.
 */
/**
 * Score a single item against a fashion DNA vector.
 *
 * Uses a normalised dot product (cosine similarity) so that items with
 * more style_tags do not automatically outscore sparse items.
 *
 * score = dot(item.style_tags, dna) / (|item.style_tags| * |dna|)
 *
 * If either vector has zero magnitude, returns 0.
 */
export function scoreItem(item: WardrobeItem, dna: StyleVector): number {
  const tags = item.style_tags;
  if (!tags) return 0;

  let dot = 0;
  let tagMagSq = 0;

  for (const dim in tags) {
    const t = tags[dim] ?? 0;
    if (t !== 0) {
      tagMagSq += t * t;
      const d = dna[dim];
      if (d) {
        dot += t * d;
      }
    }
  }

  if (tagMagSq === 0) return 0;

  let dnaMagSq = 0;
  for (const dim in dna) {
    const d = dna[dim] ?? 0;
    if (d !== 0) {
      dnaMagSq += d * d;
    }
  }

  if (dnaMagSq === 0) return 0;

  const mag = Math.sqrt(tagMagSq) * Math.sqrt(dnaMagSq);
  return mag === 0 ? 0 : dot / mag;
}

/** Precomputed representation of a StyleVector for fast repeated scoring. */
export interface CompiledStyleVector {
  vector: StyleVector;
  magnitude: number;
}

/** Precomputes vector magnitude once for invariant reuse across many items. */
export function compileStyleVector(dna: StyleVector): CompiledStyleVector {
  let dnaMagSq = 0;
  for (const dim in dna) {
    const d = dna[dim] ?? 0;
    if (d !== 0) {
      dnaMagSq += d * d;
    }
  }
  return {
    vector: dna,
    magnitude: Math.sqrt(dnaMagSq),
  };
}

/** Fast item scoring against precompiled fashion DNA. */
export function scoreItemCompiled(item: WardrobeItem, compiled: CompiledStyleVector): number {
  const tags = item.style_tags;
  if (!tags || compiled.magnitude === 0) return 0;

  let dot = 0;
  let tagMagSq = 0;
  const dna = compiled.vector;

  for (const dim in tags) {
    const t = tags[dim] ?? 0;
    if (t !== 0) {
      tagMagSq += t * t;
      const d = dna[dim];
      if (d) {
        dot += t * d;
      }
    }
  }

  if (tagMagSq === 0) return 0;
  const mag = Math.sqrt(tagMagSq) * compiled.magnitude;
  return mag === 0 ? 0 : dot / mag;
}

/**
 * Score an outfit as the arithmetic mean of its constituent item scores.
 * Returns a value in [0, 1], rounded to 4 decimal places.
 */
export function scoreOutfit(items: WardrobeItem[], dna: StyleVector): number {
  if (items.length === 0) return 0;
  const compiled = compileStyleVector(dna);
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    sum += scoreItemCompiled(items[i], compiled);
  }
  return Math.round((sum / items.length) * 10_000) / 10_000;
}

/**
 * Produce a stable string key for an outfit to detect duplicates.
 * Sorted so that slot order doesn't create phantom duplicates.
 */
export function outfitKey(items: { id: string }[]): string {
  return items
    .map((i) => i.id)
    .sort()
    .join('|');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RecommendOutfitsOptions {
  /** Max number of outfits to return. Default: 5. */
  topN?: number;
}

interface ScoredWardrobeItem {
  item: WardrobeItem;
  score: number;
}

/**
 * Given a list of the user's wardrobe items and their fashion DNA vector,
 * return the top N valid outfit combinations ranked by score descending.
 *
 * Employs bounded top-K candidate search:
 * - Precomputes DNA magnitude and individual item scores once.
 * - Because outfit score is linear-separable across slots, no item below
 *   rank topN within its role can ever be part of a topN outfit.
 * - Evaluates bounded candidate space with an in-place min-tracked buffer
 *   instead of generating, allocating, and sorting millions of combinations.
 *
 * @param items - The user's own wardrobe items (NOT the global catalog).
 * @param dna   - The user's fashion DNA vector from fashion_dna.vector.
 * @param opts  - Optional configuration.
 * @returns     Array of up to `topN` distinct, valid outfits sorted by
 *              score descending. Each outfit is { items, score }.
 */
export function recommendOutfits(
  items: WardrobeItem[],
  dna: StyleVector,
  opts: RecommendOutfitsOptions = {},
): Outfit[] {
  const topN = opts.topN ?? 5;
  if (items.length === 0 || topN <= 0) return [];

  const compiledDna = compileStyleVector(dna);

  // Partition items by layer role and precompute individual item scores.
  const byRole: Record<LayerRole, ScoredWardrobeItem[]> = {
    base_layer: [],
    bottom: [],
    footwear: [],
    outerwear: [],
    accessory: [],
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const role = item.layer_role as LayerRole;
    if (role in byRole) {
      const score = scoreItemCompiled(item, compiledDna);
      byRole[role].push({ item, score });
    }
  }

  // Validity check: required slots must be present.
  if (
    byRole.base_layer.length === 0 ||
    byRole.bottom.length === 0 ||
    byRole.footwear.length === 0
  ) {
    return [];
  }

  // Sort each slot's candidates descending by score once: O(M log M).
  byRole.base_layer.sort((a, b) => b.score - a.score);
  byRole.bottom.sort((a, b) => b.score - a.score);
  byRole.footwear.sort((a, b) => b.score - a.score);
  byRole.outerwear.sort((a, b) => b.score - a.score);
  byRole.accessory.sort((a, b) => b.score - a.score);

  // Candidate bounding: within each slot, at most topN candidates are needed.
  const bases = byRole.base_layer.slice(0, topN);
  const bottoms = byRole.bottom.slice(0, topN);
  const footwearItems = byRole.footwear.slice(0, topN);
  const outerwear = byRole.outerwear.slice(0, topN);
  const accessories = byRole.accessory.slice(0, topN);

  const outerwearSlots: (ScoredWardrobeItem | null)[] = [null, ...outerwear];
  const accessorySlots: (ScoredWardrobeItem | null)[] = [null, ...accessories];

  interface CandidateOutfit {
    score: number;
    base: WardrobeItem;
    bottom: WardrobeItem;
    shoe: WardrobeItem;
    outer: WardrobeItem | null;
    acc: WardrobeItem | null;
  }

  // Bounded buffer to collect topN candidates without allocating unused combinations.
  const topCandidates: CandidateOutfit[] = [];
  let minScoreInTop = -1;

  for (let bi = 0; bi < bases.length; bi++) {
    const base = bases[bi];
    for (let boi = 0; boi < bottoms.length; boi++) {
      const bottom = bottoms[boi];
      for (let fi = 0; fi < footwearItems.length; fi++) {
        const shoe = footwearItems[fi];
        for (let oi = 0; oi < outerwearSlots.length; oi++) {
          const outer = outerwearSlots[oi];
          for (let ai = 0; ai < accessorySlots.length; ai++) {
            const acc = accessorySlots[ai];

            let sum = base.score + bottom.score + shoe.score;
            let count = 3;
            if (outer) {
              sum += outer.score;
              count += 1;
            }
            if (acc) {
              sum += acc.score;
              count += 1;
            }

            const score = Math.round((sum / count) * 10_000) / 10_000;

            if (topCandidates.length < topN) {
              topCandidates.push({
                score,
                base: base.item,
                bottom: bottom.item,
                shoe: shoe.item,
                outer: outer ? outer.item : null,
                acc: acc ? acc.item : null,
              });
              if (topCandidates.length === topN) {
                topCandidates.sort((x, y) => x.score - y.score);
                minScoreInTop = topCandidates[0].score;
              }
            } else if (score > minScoreInTop) {
              topCandidates[0] = {
                score,
                base: base.item,
                bottom: bottom.item,
                shoe: shoe.item,
                outer: outer ? outer.item : null,
                acc: acc ? acc.item : null,
              };
              topCandidates.sort((x, y) => x.score - y.score);
              minScoreInTop = topCandidates[0].score;
            }
          }
        }
      }
    }
  }

  // Final sort descending by score
  topCandidates.sort((a, b) => b.score - a.score);

  return topCandidates.map((c) => {
    const slotItems: WardrobeItem[] = [c.base, c.bottom, c.shoe];
    if (c.outer) slotItems.push(c.outer);
    if (c.acc) slotItems.push(c.acc);
    return {
      items: slotItems,
      score: c.score,
    };
  });
}

