/**
 * Phase 4B Gate 3: Domain Contracts
 *
 * Provider-independent contracts for the wardrobe item extraction pipeline.
 * These types are decoupled from AI provider SDKs (Groq, Gemini, rembg)
 * and database/Supabase persistence types.
 */

import {
  WARDROBE_CATEGORIES,
  type WardrobeCategory,
  type WardrobeLayerRole,
} from '@/src/lib/wardrobe/normalize';

export const WARDROBE_LAYER_ROLES = [
  'base_layer',
  'bottom',
  'one_piece',
  'footwear',
  'outerwear',
  'accessory',
] as const;

export {
  WARDROBE_CATEGORIES,
  type WardrobeCategory,
  type WardrobeLayerRole,
};

/**
 * Normalized 0..1 bounding box coordinates.
 * Exact Invariants:
 *  - 0 <= x < 1
 *  - 0 <= y < 1
 *  - 0 < width <= 1
 *  - 0 < height <= 1
 *  - x + width <= 1
 *  - y + height <= 1
 */
export type CropBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Pipeline status enums aligned with database check constraints
 * from Phase 4B migrations (0014, 0015).
 *
 * NOTE on PrettifyStatus:
 * Database persistence state machine: none -> processing -> done | failed.
 * Client/execution-level omission is NOT persisted as 'skipped'.
 */
export type ProcessingStatus =
  | 'detected'
  | 'isolating'
  | 'isolated'
  | 'extracting'
  | 'extracted'
  | 'failed';

export type PrettifyStatus =
  | 'none'
  | 'processing'
  | 'done'
  | 'failed';

export type SourcePhotoStatus =
  | 'uploading'
  | 'detecting'
  | 'done'
  | 'failed';

export type ExtractionStage =
  | 'detection'
  | 'crop'
  | 'background_removal'
  | 'attribute_extraction'
  | 'prettify';

/**
 * Stage 1: Detection Output
 * Represents a garment located within a source photo before background isolation.
 */
export interface Detection {
  box: CropBox;
  category: WardrobeCategory;
  confidence: number;
  label?: string;
}

/**
 * Stage 2: Isolation Output
 * Represents the isolated garment image extracted using the crop box.
 */
export interface IsolationResult {
  rawImageUrl: string;
  box: CropBox;
  confidence: number;
}

/**
 * Stage 3: Extracted Wardrobe Attributes
 * Structured metadata extracted from the isolated garment image.
 * All collections and scores are strictly typed without external SDK coupling.
 */
export interface ExtractedAttributes {
  category: WardrobeCategory;
  subcategory?: string | null;
  displayName: string;
  color: {
    primary: string;
    secondary?: string | null;
    familyWeights?: Record<string, number>;
  };
  material?: {
    primary?: string;
    weights?: Record<string, number>;
  };
  fit?: {
    weights?: Record<string, number>;
  };
  pattern?: string | null;
  styleTags?: Record<string, number>;
  formalityScore?: number;
  seasonWeights?: {
    spring?: number;
    summer?: number;
    fall?: number;
    winter?: number;
  };
  layerRole?: WardrobeLayerRole | null;
}

/**
 * Stage 3: Extraction Output
 * Complete result containing attributes, overall confidence, and field-level confidence scores.
 */
export interface ExtractionResult {
  attributes: ExtractedAttributes;
  confidence: number;
  confidencePerField: Record<string, number>;
  rawImageUrl: string;
}

/**
 * Stage 4: Optional Prettification Output
 *
 * Prettify Execution Status vs Database Persistence State:
 *  - Execution Result (PrettifyResult.status):
 *      'done': Prettification succeeded, prettified image URL available.
 *      'failed': Prettification attempted but failed with error.
 *      'skipped': Optional stage omitted by pipeline/caller.
 *
 *  - Database Persistence State (PrettifyStatus in wardrobe_items.prettify_status):
 *      Allowed check constraints: ('none', 'processing', 'done', 'failed').
 *      'skipped' is an in-memory execution result concept ONLY. When prettify
 *      is skipped/omitted, the database status remains 'none'.
 */
export interface PrettifyResult {
  status: 'done' | 'failed' | 'skipped';
  prettifiedImageUrl?: string | null;
  originalImageUrl: string;
  error?: string | null;
}
