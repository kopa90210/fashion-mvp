/**
 * Phase 4B Gate 3: Deterministic Mock Prettifier
 *
 * Simulates optional garment background beautification / restyling.
 * Supports failure simulation (which must not invalidate extraction results).
 */

import type { PrettifyResult } from '../../contracts';
import type { GarmentPrettifier } from '../prettifier';
import { AIProviderError } from './errors';
import type { MockBehaviorMode } from './mock-detector';

export interface MockPrettifierOptions {
  mode?: MockBehaviorMode;
  failureMessage?: string;
  throwOnFailure?: boolean;
  malformedPayload?: unknown;
}

export class MockPrettifier implements GarmentPrettifier {
  private mode: MockBehaviorMode;
  private failureMessage: string;
  private throwOnFailure: boolean;
  private malformedPayload?: unknown;

  constructor(options: MockPrettifierOptions = {}) {
    this.mode = options.mode ?? 'normal';
    this.failureMessage = options.failureMessage ?? 'Simulated prettification failure';
    this.throwOnFailure = options.throwOnFailure ?? false;
    this.malformedPayload = options.malformedPayload;
  }

  public setMode(mode: MockBehaviorMode, failureMessage?: string, throwOnFailure = false): void {
    this.mode = mode;
    if (failureMessage) this.failureMessage = failureMessage;
    this.throwOnFailure = throwOnFailure;
  }

  public setMalformedPayload(payload: unknown): void {
    this.malformedPayload = payload;
  }

  public reset(): void {
    this.mode = 'normal';
    this.failureMessage = 'Simulated prettification failure';
    this.throwOnFailure = false;
    this.malformedPayload = undefined;
  }

  async prettify(rawImageUrl: string): Promise<PrettifyResult> {
    if (this.mode === 'failure') {
      if (this.throwOnFailure) {
        throw new AIProviderError(this.failureMessage, 'MockPrettifier');
      }
      return {
        status: 'failed',
        originalImageUrl: rawImageUrl,
        prettifiedImageUrl: null,
        error: this.failureMessage,
      };
    }

    if (this.mode === 'malformed') {
      if (this.malformedPayload !== undefined) {
        return this.malformedPayload as PrettifyResult;
      }
      return {
        status: 'invalid_status' as unknown as 'done',
        originalImageUrl: '',
        prettifiedImageUrl: null,
      };
    }

    // Deterministic normal output
    return {
      status: 'done',
      originalImageUrl: rawImageUrl,
      prettifiedImageUrl: 'https://mock.storage/prettified/enhanced-garment.png',
      error: null,
    };
  }
}
