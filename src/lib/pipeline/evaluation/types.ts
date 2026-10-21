import type { CropBox, WardrobeCategory } from '../contracts';

export interface GoldenGarment {
  category: WardrobeCategory;
  box: CropBox;
}

export interface GoldenExample {
  image: string;
  expected: {
    garments: GoldenGarment[];
  };
}

export interface EvaluationMetric {
  name: string;
  value: number | 'NOT MEASURED';
}

/**
 * Golden dataset collection for evaluation.
 * Each example contains an image URL and expected garment annotations.
 */
export type GoldenDataset = GoldenExample[];

