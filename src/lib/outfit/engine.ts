/**
 * Outfit Recommendation Engine
 *
 * Pure module — no Supabase, no React, no model calls.
 * Takes a user's wardrobe items + their fashion DNA vector and returns
 * the top N ranked outfit combinations.
 *
 * Outfit validity rules support either a separates core
 * (base_layer + bottom + footwear) or one-piece core
 * (one_piece + footwear), without mixing those cores.
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
  | 'one_piece'
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

/** Validate the two canonical outfit structures without scoring or persistence. */
export function isValidOutfitStructure(items: Pick<WardrobeItem, 'layer_role'>[]): boolean {
  const counts: Record<LayerRole, number> = {
    base_layer: 0,
    bottom: 0,
    one_piece: 0,
    footwear: 0,
    outerwear: 0,
    accessory: 0,
  }
  for (const item of items) {
    if (!(item.layer_role in counts)) return false
    counts[item.layer_role] += 1
  }
  if (counts.footwear !== 1 || counts.outerwear > 1 || counts.accessory > 1) return false
  const separates = counts.base_layer === 1 && counts.bottom === 1 && counts.one_piece === 0
  const onePiece = counts.base_layer === 0 && counts.bottom === 0 && counts.one_piece === 1
  return separates || onePiece
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface RecommendOutfitsOptions {
  /** Max number of outfits to return. Default: 5. */
  topN?: number;
  /** Require this supplied wardrobe piece in every result. */
  anchorItemId?: string;
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
    one_piece: [],
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

  const anchor = opts.anchorItemId !== undefined ? items.find((item) => item.id === opts.anchorItemId) : undefined;
  if (opts.anchorItemId !== undefined) {
    if (!anchor || !(anchor.layer_role in byRole)) return [];
    byRole[anchor.layer_role] = byRole[anchor.layer_role].filter(({ item }) => item.id === anchor.id);
  }

  const canBuildSeparates = byRole.base_layer.length > 0 && byRole.bottom.length > 0
  const canBuildOnePiece = byRole.one_piece.length > 0
  if (byRole.footwear.length === 0 || (!canBuildSeparates && !canBuildOnePiece)) {
    return [];
  }

  // Sort each slot's candidates descending by score once: O(M log M).
  byRole.base_layer.sort((a, b) => b.score - a.score);
  byRole.bottom.sort((a, b) => b.score - a.score);
  byRole.one_piece.sort((a, b) => b.score - a.score);
  byRole.footwear.sort((a, b) => b.score - a.score);
  byRole.outerwear.sort((a, b) => b.score - a.score);
  byRole.accessory.sort((a, b) => b.score - a.score);

  // Candidate bounding: within each slot, at most topN candidates are needed.
  const bases = byRole.base_layer.slice(0, topN);
  const bottoms = byRole.bottom.slice(0, topN);
  const onePieces = byRole.one_piece.slice(0, topN);
  const footwearItems = byRole.footwear.slice(0, topN);
  const outerwear = byRole.outerwear.slice(0, topN);
  const accessories = byRole.accessory.slice(0, topN);

  const outerwearSlots: (ScoredWardrobeItem | null)[] = anchor?.layer_role === 'outerwear' ? outerwear : [null, ...outerwear];
  const accessorySlots: (ScoredWardrobeItem | null)[] = anchor?.layer_role === 'accessory' ? accessories : [null, ...accessories];

  type RankedCandidate = Outfit & { key: string }
  const candidates: RankedCandidate[] = []
  const isBetter = (candidate: RankedCandidate, current: RankedCandidate) =>
    candidate.score > current.score || (candidate.score === current.score && candidate.key < current.key)
  const worstFirst = (a: RankedCandidate, b: RankedCandidate) =>
    a.score - b.score || b.key.localeCompare(a.key)
  const addCandidate = (core: ScoredWardrobeItem[], shoe: ScoredWardrobeItem, outer: ScoredWardrobeItem | null, acc: ScoredWardrobeItem | null) => {
    let sum = shoe.score
    let count = 1
    for (const entry of core) { sum += entry.score; count += 1 }
    if (outer) { sum += outer.score; count += 1 }
    if (acc) { sum += acc.score; count += 1 }
    const score = Math.round((sum / count) * 10_000) / 10_000
    if (candidates.length === topN) {
      if (score < candidates[0].score) return
    }
    const candidateItems = core.map(({ item }) => item)
    candidateItems.push(shoe.item)
    if (outer) candidateItems.push(outer.item)
    if (acc) candidateItems.push(acc.item)
    const candidate = { items: candidateItems, score, key: outfitKey(candidateItems) }
    if (candidates.length < topN) {
      candidates.push(candidate)
      if (candidates.length === topN) candidates.sort(worstFirst)
      return
    }
    if (isBetter(candidate, candidates[0])) {
      candidates[0] = candidate
      candidates.sort(worstFirst)
    }
  }

  const separatesAllowed = canBuildSeparates && anchor?.layer_role !== 'one_piece'
  const onePieceAllowed = canBuildOnePiece && anchor?.layer_role !== 'base_layer' && anchor?.layer_role !== 'bottom'
  for (const shoe of footwearItems) {
    for (const outer of outerwearSlots) {
      for (const acc of accessorySlots) {
        if (separatesAllowed) {
          for (const base of bases) {
            for (const bottom of bottoms) addCandidate([base, bottom], shoe, outer, acc)
          }
        }
        if (onePieceAllowed) {
          for (const onePiece of onePieces) addCandidate([onePiece], shoe, outer, acc)
        }
      }
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .map(({ items: candidateItems, score }) => ({ items: candidateItems, score }))
}

