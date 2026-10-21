import type { Detection } from '../contracts';
import type { EvaluationMetric, GoldenExample, GoldenGarment } from './types';

/**
 * Calculate Intersection over Union (IoU) between two bounding boxes.
 * Both boxes are in normalized [0, 1] coordinates.
 */
export function intersectionOverUnion(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number }
): number {
  const x1 = Math.max(left.x, right.x);
  const y1 = Math.max(left.y, right.y);
  const x2 = Math.min(left.x + left.width, right.x + right.width);
  const y2 = Math.min(left.y + left.height, right.y + right.height);

  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = left.width * left.height + right.width * right.height - intersection;

  return union === 0 ? 0 : intersection / union;
}

/**
 * Represents a matched detection pair with IoU score.
 */
interface MatchedDetection {
  prediction: Detection;
  groundTruth: GoldenGarment;
  iou: number;
  categoryMatch: boolean;
}

/**
 * Greedy one-to-one bipartite matching between predictions and ground truth.
 * 
 * A candidate is eligible ONLY when:
 *   1. prediction.category === groundTruth.category (exact category match)
 *   2. AND IoU >= threshold (spatial overlap requirement)
 *
 * Returns the best non-overlapping assignments, sorted by IoU.
 */
function greedyMatch(
  predictions: Detection[],
  groundTruths: GoldenGarment[],
  iouThreshold: number = 0.5
): MatchedDetection[] {
  const matches: MatchedDetection[] = [];
  const usedPredictions = new Set<number>();
  const usedGroundTruths = new Set<number>();

  // Create all possible match candidates
  const candidates: Array<{
    predIdx: number;
    truthIdx: number;
    pred: Detection;
    truth: GoldenGarment;
    iou: number;
  }> = [];

  for (let i = 0; i < predictions.length; i++) {
    for (let j = 0; j < groundTruths.length; j++) {
      const iou = intersectionOverUnion(predictions[i].box, groundTruths[j].box);
      const categoryMatch = predictions[i].category === groundTruths[j].category;

      // BLOCKER: Candidate is eligible ONLY if BOTH category matches AND IoU threshold met
      if (categoryMatch && iou >= iouThreshold) {
        candidates.push({
          predIdx: i,
          truthIdx: j,
          pred: predictions[i],
          truth: groundTruths[j],
          iou,
        });
      }
    }
  }

  // Sort by IoU descending (greedy: best matches first)
  candidates.sort((a, b) => b.iou - a.iou);

  // Greedy assignment: assign each candidate if both prediction and ground truth are unused
  for (const candidate of candidates) {
    if (!usedPredictions.has(candidate.predIdx) && !usedGroundTruths.has(candidate.truthIdx)) {
      usedPredictions.add(candidate.predIdx);
      usedGroundTruths.add(candidate.truthIdx);
      matches.push({
        prediction: candidate.pred,
        groundTruth: candidate.truth,
        iou: candidate.iou,
        categoryMatch: true, // Always true since we only add matching categories
      });
    }
  }

  return matches;
}

/**
 * Evaluate detections against ground truth.
 *
 * Calculates:
 *   - True Positives (TP): matched with IoU >= threshold and correct category
 *   - False Positives (FP): predictions not matched or matched with wrong category
 *   - False Negatives (FN): ground truth not matched
 *   - Precision: TP / (TP + FP)
 *   - Recall: TP / (TP + FN)
 *   - Mean IoU: average IoU of matched detections
 *   - Category accuracy: correct category matches
 */
export interface DetectionEvaluationResult {
  tp: number; // True positives
  fp: number; // False positives
  fn: number; // False negatives
  precision: number; // TP / (TP + FP)
  recall: number; // TP / (TP + FN)
  f1Score: number; // 2 * (precision * recall) / (precision + recall)
  meanIoU: number; // Average IoU of matched detections
  categoryAccuracy: number; // Correct category matches / TP
  metrics: EvaluationMetric[];
}

export function evaluateDetection(
  example: GoldenExample,
  actual: Detection[],
  iouThreshold: number = 0.5
): DetectionEvaluationResult {
  const groundTruths = example.expected.garments;

  // No ground truth: cannot measure
  if (groundTruths.length === 0) {
    return {
      tp: 0,
      fp: actual.length,
      fn: 0,
      precision: 0,
      recall: 0,
      f1Score: 0,
      meanIoU: 0,
      categoryAccuracy: 0,
      metrics: [
        { name: 'detection_precision', value: 'NOT MEASURED' },
        { name: 'detection_recall', value: 'NOT MEASURED' },
        { name: 'detection_f1', value: 'NOT MEASURED' },
        { name: 'mean_iou', value: 'NOT MEASURED' },
        { name: 'category_accuracy', value: 'NOT MEASURED' },
      ],
    };
  }

  // One-to-one matching with IoU threshold
  const matches = greedyMatch(actual, groundTruths, iouThreshold);

  // Calculate metrics
  const tp = matches.filter((m) => m.categoryMatch).length;
  const correctCategoryInMatches = matches.filter((m) => m.categoryMatch).length;
  const fp = actual.length - matches.length;
  const fn = groundTruths.length - matches.length;

  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1Score =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);

  const meanIoU =
    matches.length === 0
      ? 0
      : matches.reduce((sum, m) => sum + m.iou, 0) / matches.length;

  const categoryAccuracy =
    matches.length === 0
      ? 0
      : correctCategoryInMatches / matches.length;

  return {
    tp,
    fp,
    fn,
    precision,
    recall,
    f1Score,
    meanIoU,
    categoryAccuracy,
    metrics: [
      { name: 'detection_precision', value: precision },
      { name: 'detection_recall', value: recall },
      { name: 'detection_f1', value: f1Score },
      { name: 'mean_iou', value: meanIoU },
      { name: 'category_accuracy', value: categoryAccuracy },
      { name: 'tp', value: tp },
      { name: 'fp', value: fp },
      { name: 'fn', value: fn },
    ],
  };
}

