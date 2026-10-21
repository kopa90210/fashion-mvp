/**
 * Phase 4B Gate 3: Deterministic Mock Extractor
 *
 * Simulates attribute extraction from an isolated garment image.
 * Supports controlled failure injection and malformed output testing.
 */

import type { ExtractionResult } from '../../contracts';
import type { AttributeExtractor } from '../extractor';
import { AIProviderError } from './errors';
import type { MockBehaviorMode } from './mock-detector';

export interface MockExtractorOptions {
  mode?: MockBehaviorMode;
  failureMessage?: string;
  malformedPayload?: unknown;
}

export class MockExtractor implements AttributeExtractor {
  private mode: MockBehaviorMode;
  private failureMessage: string;
  private malformedPayload?: unknown;

  constructor(options: MockExtractorOptions = {}) {
    this.mode = options.mode ?? 'normal';
    this.failureMessage = options.failureMessage ?? 'Simulated extraction failure';
    this.malformedPayload = options.malformedPayload;
  }

  public setMode(mode: MockBehaviorMode, failureMessage?: string): void {
    this.mode = mode;
    if (failureMessage) this.failureMessage = failureMessage;
  }

  public setMalformedPayload(payload: unknown): void {
    this.malformedPayload = payload;
  }

  public reset(): void {
    this.mode = 'normal';
    this.failureMessage = 'Simulated extraction failure';
    this.malformedPayload = undefined;
  }

  async extract(rawImageUrl: string): Promise<ExtractionResult> {
    if (this.mode === 'failure') {
      throw new AIProviderError(this.failureMessage, 'MockExtractor');
    }

    if (this.mode === 'malformed') {
      if (this.malformedPayload !== undefined) {
        return this.malformedPayload as ExtractionResult;
      }
      // Malformed result: missing required fields, confidence outside 0..1
      return {
        rawImageUrl: 'invalid-uri',
        confidence: 1.4,
        confidencePerField: { category: -0.5 },
        attributes: {} as unknown as ExtractionResult['attributes'],
      };
    }

    // Deterministic normal output
    return {
      rawImageUrl,
      confidence: 0.94,
      confidencePerField: {
        category: 0.98,
        subcategory: 0.92,
        displayName: 0.95,
        color: 0.96,
        material: 0.88,
        fit: 0.90,
        pattern: 0.94,
        styleTags: 0.85,
        formalityScore: 0.90,
        seasonWeights: 0.91,
        layerRole: 0.95,
      },
      attributes: {
        category: 'top',
        subcategory: 'sweater',
        displayName: 'Merino Wool Crewneck',
        color: {
          primary: 'navy',
          secondary: 'grey',
          familyWeights: { dark: 0.8, neutral: 0.2 },
        },
        material: {
          primary: 'wool',
          weights: { wool: 0.9, cashmere: 0.1 },
        },
        fit: {
          weights: { regular: 0.8, slim: 0.2 },
        },
        pattern: 'solid',
        styleTags: {
          minimal: 0.7,
          smart_casual: 0.3,
        },
        formalityScore: 0.6,
        seasonWeights: {
          fall: 0.4,
          winter: 0.4,
          spring: 0.2,
          summer: 0.0,
        },
        layerRole: 'base_layer',
      },
    };
  }
}
