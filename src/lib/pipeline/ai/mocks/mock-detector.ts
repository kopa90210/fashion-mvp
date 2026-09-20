/**
 * Phase 4B Gate 3: Deterministic Mock Detector
 *
 * Simulates garment detection with zero network calls and zero API keys.
 * Supports controlled failure injection and malformed output testing.
 */

import type { Detection } from '../../contracts';
import type { GarmentDetector } from '../detector';
import { AIProviderError } from './errors';

export type MockBehaviorMode = 'normal' | 'failure' | 'malformed';

export interface MockDetectorOptions {
  mode?: MockBehaviorMode;
  failureMessage?: string;
  malformedPayload?: unknown;
}

export class MockDetector implements GarmentDetector {
  private mode: MockBehaviorMode;
  private failureMessage: string;
  private malformedPayload?: unknown;

  constructor(options: MockDetectorOptions = {}) {
    this.mode = options.mode ?? 'normal';
    this.failureMessage = options.failureMessage ?? 'Simulated detection failure';
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
    this.failureMessage = 'Simulated detection failure';
    this.malformedPayload = undefined;
  }

  async detect(imageUrl: string): Promise<Detection[]> {
    void imageUrl;

    if (this.mode === 'failure') {
      throw new AIProviderError(this.failureMessage, 'MockDetector');
    }

    if (this.mode === 'malformed') {
      if (this.malformedPayload !== undefined) {
        return this.malformedPayload as Detection[];
      }
      // Default malformed response: violated invariants (x + width > 1, confidence > 1, invalid category)
      return [
        {
          box: { x: 0.8, y: 0.2, width: 0.5, height: 0.5 },
          category: 'invalid_category' as unknown as 'top',
          confidence: 1.5,
          label: 'malformed item',
        },
      ];
    }

    // Deterministic normal output: 2 garments (top & bottom)
    return [
      {
        box: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 },
        category: 'top',
        confidence: 0.95,
        label: 'crewneck sweater',
      },
      {
        box: { x: 0.2, y: 0.5, width: 0.6, height: 0.45 },
        category: 'bottom',
        confidence: 0.92,
        label: 'straight trousers',
      },
    ];
  }
}
