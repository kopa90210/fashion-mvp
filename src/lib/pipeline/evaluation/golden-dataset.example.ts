/**
 * Phase 4B Gate 4: Golden Dataset Example (REFERENCE FORMAT ONLY)
 *
 * This file demonstrates the EXPECTED FORMAT for evaluation datasets.
 * No real labeled images have been evaluated yet.
 *
 * Each example contains:
 *   - image: URL or path to the image
 *   - expected: Object with garments array
 *     - garments: Array of GoldenGarment (category + normalized box)
 *
 * Canonical categories: top, bottom, footwear, outerwear, accessory
 * Box coordinates: normalized [0, 1] with invariants:
 *   - 0 <= x < 1
 *   - 0 <= y < 1
 *   - 0 < width <= 1
 *   - 0 < height <= 1
 *   - x + width <= 1
 *   - y + height <= 1
 *
 * BLOCKER FIX: Do not claim metrics until real labeled images are evaluated.
 * These examples are provided for reference only.
 */

import type { GoldenExample, GoldenDataset } from './types';

/**
 * Single garment example - simple t-shirt image.
 * Expected: One top garment detected in upper-center portion.
 */
export const goldenSingleTopExample: GoldenExample = {
  image: 'https://example.com/images/single-tshirt.jpg',
  expected: {
    garments: [
      {
        category: 'top',
        box: {
          x: 0.2,
          y: 0.1,
          width: 0.6,
          height: 0.4,
        },
      },
    ],
  },
};

/**
 * Multiple garments example - full outfit.
 * Expected: Top, bottom, and shoes all visible.
 */
export const goldenFullOutfitExample: GoldenExample = {
  image: 'https://example.com/images/full-outfit.jpg',
  expected: {
    garments: [
      {
        category: 'top',
        box: {
          x: 0.15,
          y: 0.08,
          width: 0.7,
          height: 0.35,
        },
      },
      {
        category: 'bottom',
        box: {
          x: 0.1,
          y: 0.38,
          width: 0.8,
          height: 0.35,
        },
      },
      {
        category: 'footwear',
        box: {
          x: 0.2,
          y: 0.75,
          width: 0.6,
          height: 0.2,
        },
      },
    ],
  },
};

/**
 * Overlapping garments example - layered clothing.
 * Expected: Jacket and shirt underneath both visible, box overlaps.
 */
export const goldenLayeredExample: GoldenExample = {
  image: 'https://example.com/images/layered-outfit.jpg',
  expected: {
    garments: [
      {
        category: 'outerwear',
        box: {
          x: 0.1,
          y: 0.1,
          width: 0.8,
          height: 0.5,
        },
      },
      {
        category: 'top',
        box: {
          x: 0.2,
          y: 0.15,
          width: 0.6,
          height: 0.35,
        },
      },
    ],
  },
};

/**
 * Accessory example - bag or hat.
 */
export const goldenAccessoryExample: GoldenExample = {
  image: 'https://example.com/images/bag-accessory.jpg',
  expected: {
    garments: [
      {
        category: 'accessory',
        box: {
          x: 0.65,
          y: 0.2,
          width: 0.3,
          height: 0.3,
        },
      },
    ],
  },
};

/**
 * Empty image example - no garments detected.
 */
export const goldenEmptyExample: GoldenExample = {
  image: 'https://example.com/images/no-garments.jpg',
  expected: {
    garments: [],
  },
};

/**
 * Sample golden dataset format reference.
 * DO NOT claim metrics from these examples - they are placeholders only.
 * Real metrics can ONLY be computed after evaluating against real, manually-labeled images.
 *
 * Gate 5 should:
 *   1. Curate actual labeled images (50-100 test cases)
 *   2. Run evaluateDetection() on each with model predictions
 *   3. Aggregate results to get mean precision, recall, F1, meanIoU
 *   4. Report metrics as "Evaluated on X real labeled images"
 */
export const sampleGoldenDataset: GoldenDataset = [
  goldenSingleTopExample,
  goldenFullOutfitExample,
  goldenLayeredExample,
  goldenAccessoryExample,
  goldenEmptyExample,
];


/**
 * How to use evaluateDetection() once real labeled images are available:
 *
 * IMPORTANT: Only compute metrics AFTER you have real labeled images.
 * DO NOT extrapolate from example instances shown above.
 *
 * Gate 5 workflow:
 * 1. Collect actual images with manual labels (50-100 images)
 * 2. For each labeled image, run detector and call evaluateDetection()
 * 3. Aggregate TP/FP/FN across all images
 * 4. Report final precision, recall, F1, meanIoU
 *
 * Example:
 *
 * ```typescript
 * import { evaluateDetection } from './metrics';
 * import type { GoldenExample } from './types';
 *
 * const realLabeledDataset: GoldenExample[] = [
 *   // Load from file or fetch from server
 *   // { image: 'path-to-real-labeled-1.jpg', expected: { garments: [...] } },
 *   // { image: 'path-to-real-labeled-2.jpg', expected: { garments: [...] } },
 * ];
 *
 * let totalTP = 0, totalFP = 0, totalFN = 0;
 *
 * for (const example of realLabeledDataset) {
 *   const predictions = await detector.detect(example.image);
 *   const result = evaluateDetection(example, predictions);
 *   totalTP += result.tp;
 *   totalFP += result.fp;
 *   totalFN += result.fn;
 * }
 *
 * const precision = totalTP / (totalTP + totalFP);
 * const recall = totalTP / (totalTP + totalFN);
 * console.log(`Evaluated on ${realLabeledDataset.length} real images:`);
 * console.log(`  Precision: ${precision.toFixed(2)}`);
 * console.log(`  Recall: ${recall.toFixed(2)}`);
 * ```
 */