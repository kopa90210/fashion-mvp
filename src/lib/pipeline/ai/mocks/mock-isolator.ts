/**
 * Phase 4B Gate 3: Deterministic Mock Isolator
 *
 * Simulates garment crop and background isolation.
 * Supports controlled failure injection and malformed output testing.
 */

import type { CropBox, IsolationResult } from '../../contracts';
import type { GarmentIsolator } from '../isolator';
import { AIProviderError } from './errors';
import type { MockBehaviorMode } from './mock-detector';

export interface MockIsolatorOptions {
  mode?: MockBehaviorMode;
  failureMessage?: string;
  malformedPayload?: unknown;
}

export class MockIsolator implements GarmentIsolator {
  private mode: MockBehaviorMode;
  private failureMessage: string;
  private malformedPayload?: unknown;

  constructor(options: MockIsolatorOptions = {}) {
    this.mode = options.mode ?? 'normal';
    this.failureMessage = options.failureMessage ?? 'Simulated isolation failure';
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
    this.failureMessage = 'Simulated isolation failure';
    this.malformedPayload = undefined;
  }

  async isolate(imageUrl: string, box: CropBox): Promise<IsolationResult> {
    if (this.mode === 'failure') {
      throw new AIProviderError(this.failureMessage, 'MockIsolator');
    }

    if (this.mode === 'malformed') {
      if (this.malformedPayload !== undefined) {
        return this.malformedPayload as IsolationResult;
      }
      // Malformed result: invalid empty URL and negative confidence
      return {
        rawImageUrl: '',
        box: { x: -1, y: -1, width: 0, height: 0 },
        confidence: -0.5,
      };
    }

    // Deterministic normal output
    return {
      rawImageUrl: `https://mock.storage/isolated/garment-${box.x.toFixed(2)}-${box.y.toFixed(2)}.png`,
      box: { ...box },
      confidence: 0.98,
    };
  }
}
