/**
 * Phase 4B Gate 4: Real Groq Adapter Tests
 *
 * Tests the adapter layer with real provider responses.
 * Uses StubTransport for unit tests (no API cost).
 * Uses real Groq transport when AI_LIVE_TEST=true (requires API key).
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { Detection, ExtractionResult, CropBox } from '../../contracts';
import type { GarmentDetector } from '../detector';
import type { AttributeExtractor } from '../extractor';
import type { GarmentIsolator } from '../isolator';
import type { GarmentPrettifier } from '../prettifier';
import { RealGroqDetector, RealGroqExtractor, RealLocalIsolator, RealGroqPrettifier, GroqVisionTransport } from './index';
import { AIProviderError } from '../errors';
import type { GroqVisionRequest } from './groq-transport';
import type { GoldenExample, GoldenGarment } from '../../evaluation/types';

class StubGroqTransport {
  constructor(private readonly response: string, private readonly failure?: Error) {}
  async generate(request: GroqVisionRequest): Promise<string> {
    void request;
    if (this.failure) throw this.failure;
    return this.response;
  }
}

const detection: Detection = {
  box: { x: 0.1, y: 0.1, width: 0.4, height: 0.3 },
  category: 'top',
  confidence: 0.9,
};

const extraction: ExtractionResult = {
  rawImageUrl: 'https://example.test/garment.png',
  confidence: 0.9,
  confidencePerField: { category: 0.9 },
  attributes: { category: 'top', displayName: 'Blue shirt', color: { primary: 'blue' } },
};

describe('Real Groq Adapters — Unit Tests (StubTransport)', () => {
  it('detects garments with normalized detection format', async () => {
    const stubResponse = JSON.stringify({ detections: [detection] });
    const stub = new StubGroqTransport(stubResponse);
    const detector: GarmentDetector = new RealGroqDetector(stub);

    const result = await detector.detect('https://example.test/source.jpg');
    expect(result).toEqual([detection]);
    expect(result[0].category).toBe('top');
    expect(result[0].box.x).toBe(0.1);
    expect(result[0].confidence).toBe(0.9);
  });

  it('extracts attributes with full ExtractionResult format', async () => {
    const stubResponse = JSON.stringify(extraction);
    const stub = new StubGroqTransport(stubResponse);
    const extractor: AttributeExtractor = new RealGroqExtractor(stub);

    const result = await extractor.extract(extraction.rawImageUrl);
    expect(result).toEqual(extraction);
    expect(result.attributes.category).toBe('top');
    expect(result.attributes.displayName).toBe('Blue shirt');
  });

  it('handles markdown-wrapped JSON from Groq', async () => {
    const stubResponse = `\`\`\`json
${JSON.stringify({ detections: [detection] })}
\`\`\``;
    const stub = new StubGroqTransport(stubResponse);
    const detector: GarmentDetector = new RealGroqDetector(stub);

    const result = await detector.detect('https://example.test/source.jpg');
    expect(result).toEqual([detection]);
  });

  it('rejects invalid category with AIContractValidationError', async () => {
    const stubResponse = JSON.stringify({
      detections: [
        {
          ...detection,
          category: 'shirt', // Invalid: must be top, bottom, footwear, etc.
        },
      ],
    });
    const stub = new StubGroqTransport(stubResponse);
    const detector: GarmentDetector = new RealGroqDetector(stub);

    await expect(detector.detect('https://example.test/source.jpg')).rejects.toMatchObject({
      name: 'AIContractValidationError',
    });
  });

  it('rejects invalid confidence', async () => {
    const stubResponse = JSON.stringify({
      detections: [
        {
          ...detection,
          confidence: 1.5, // Invalid: must be 0 <= x <= 1
        },
      ],
    });
    const stub = new StubGroqTransport(stubResponse);
    const detector: GarmentDetector = new RealGroqDetector(stub);

    await expect(detector.detect('https://example.test/source.jpg')).rejects.toMatchObject({
      name: 'AIContractValidationError',
    });
  });

  it('rejects invalid CropBox (x + width > 1)', async () => {
    const stubResponse = JSON.stringify({
      detections: [
        {
          ...detection,
          box: { x: 0.8, y: 0, width: 0.5, height: 0.2 }, // x + width = 1.3 > 1
        },
      ],
    });
    const stub = new StubGroqTransport(stubResponse);
    const detector: GarmentDetector = new RealGroqDetector(stub);

    await expect(detector.detect('https://example.test/source.jpg')).rejects.toMatchObject({
      name: 'AIContractValidationError',
    });
  });

  it('rejects malformed JSON', async () => {
    const stubResponse = 'not valid json';
    const stub = new StubGroqTransport(stubResponse);
    const detector: GarmentDetector = new RealGroqDetector(stub);

    await expect(detector.detect('https://example.test/source.jpg')).rejects.toMatchObject({
      name: 'AIContractValidationError',
    });
  });

  it('rejects missing required extraction fields', async () => {
    const stubResponse = JSON.stringify({
      category: 'top',
      displayName: 'Blue shirt',
      color: { primary: '' }, // Empty primary is invalid
      confidence: 0.9,
      confidencePerField: { category: 0.9 },
    });
    const stub = new StubGroqTransport(stubResponse);
    const extractor: AttributeExtractor = new RealGroqExtractor(stub);

    await expect(extractor.extract('https://example.test/garment.png')).rejects.toMatchObject({
      name: 'AIContractValidationError',
    });
  });

  it('passes provider errors through as AIProviderError', async () => {
    const providerError = new AIProviderError('Groq API error', 'Groq', 'AI_PROVIDER_HTTP_ERROR');
    const stub = new StubGroqTransport('', providerError);
    const detector: GarmentDetector = new RealGroqDetector(stub);

    await expect(detector.detect('https://example.test/source.jpg')).rejects.toBe(providerError);
  });

  it('isolates garments with local cropping', async () => {
    const mockCropper = async (imageUrl: string, box: CropBox) => {
      void imageUrl;
      void box;
      return 'mock://cropped-image';
    };
    const isolator: GarmentIsolator = new RealLocalIsolator(mockCropper);
    const result = await isolator.isolate('https://example.test/source.jpg', detection.box);

    expect(result.rawImageUrl).toBe('mock://cropped-image');
    expect(result.box).toEqual(detection.box);
    expect(result.confidence).toBe(0.95);
  });

  it('prettifier returns skipped status for Gate 4', async () => {
    const prettifier: GarmentPrettifier = new RealGroqPrettifier();
    const result = await prettifier.prettify('https://example.test/garment.png');

    expect(result.status).toBe('skipped');
    expect(result.originalImageUrl).toBe('https://example.test/garment.png');
    expect(result.prettifiedImageUrl).toBeNull();
  });

  it('rejects invalid crop box on isolator', async () => {
    const invalidBox: CropBox = { x: 0.8, y: 0, width: 0.5, height: 0.2 }; // x + width > 1
    const mockCropper = async (imageUrl: string, box: CropBox) => {
      void imageUrl;
      void box;
      return 'mock://cropped';
    };
    const isolator: GarmentIsolator = new RealLocalIsolator(mockCropper);

    await expect(isolator.isolate('https://example.test/source.jpg', invalidBox)).rejects.toMatchObject({
      name: 'AIContractValidationError',
    });
  });

  it('handles multiple detections', async () => {
    const detections: Detection[] = [
      { box: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 }, category: 'top', confidence: 0.92 },
      { box: { x: 0.1, y: 0.35, width: 0.3, height: 0.4 }, category: 'bottom', confidence: 0.88 },
      { box: { x: 0.45, y: 0.7, width: 0.2, height: 0.2 }, category: 'footwear', confidence: 0.85 },
    ];
    const stubResponse = JSON.stringify({ detections });
    const stub = new StubGroqTransport(stubResponse);
    const detector: GarmentDetector = new RealGroqDetector(stub);

    const result = await detector.detect('https://example.test/source.jpg');
    expect(result).toHaveLength(3);
    expect(result[0].category).toBe('top');
    expect(result[1].category).toBe('bottom');
    expect(result[2].category).toBe('footwear');
  });

  it('REGRESSION: Category mismatch with perfect IoU should not match (TP=0, FP=1, FN=1)', async () => {
    // BLOCKER FIX: Verify that matching requires BOTH category match AND IoU threshold
    // Test case: GT=top, prediction=bottom, IoU=1.0 (perfect overlap but wrong category)
    // Expected: TP=0, FP=1 (prediction not matched), FN=1 (ground truth not matched)
    const { evaluateDetection } = await import('../../evaluation/metrics');

    const prediction: Detection = {
      category: 'bottom', // Wrong category
      box: { x: 0.2, y: 0.1, width: 0.6, height: 0.4 }, // Exact same box
      confidence: 0.95,
    };

    const groundTruth: GoldenGarment = {
      category: 'top', // Expected category
      box: { x: 0.2, y: 0.1, width: 0.6, height: 0.4 }, // Exact same box (IoU=1.0)
    };

    const example: GoldenExample = { image: 'test.jpg', expected: { garments: [groundTruth] } };
    const result = evaluateDetection(example, [prediction], 0.5);

    // Category mismatch should prevent matching even with perfect IoU
    expect(result.tp).toBe(0); // Not matched due to category mismatch
    expect(result.fp).toBe(1); // Prediction unmatched = false positive
    expect(result.fn).toBe(1); // Ground truth unmatched = false negative
    expect(result.precision).toBe(0); // 0 / (0 + 1) = 0
    expect(result.recall).toBe(0); // 0 / (0 + 1) = 0
    expect(result.f1Score).toBe(0); // 0 when recall=0
  });
});

describe('Real Groq Adapters — Live Provider Tests (opt-in)', () => {
  let transport: GroqVisionTransport;
  let configError: Error | null = null;
  const liveTestEnabled = process.env.AI_LIVE_TEST === 'true';

  beforeAll(() => {
    if (liveTestEnabled) {
      try {
        transport = GroqVisionTransport.fromEnv();
        console.log('✓ Live provider test configured');
      } catch (error) {
        configError = error instanceof Error ? error : new Error(String(error));
        console.error('✗ Live provider test FAILED: Configuration error detected');
        console.error(`  ${configError.message}`);
      }
    }
  });

  it.skipIf(!liveTestEnabled)(
    'BLOCKER: fails with clear error when AI_LIVE_TEST=true but credentials missing',
    async () => {
      // BLOCKER FIX: Verify that missing configuration is caught early with clear error message
      if (configError) {
        expect(configError.message).toContain('AI_PROVIDER');
        throw new Error(
          `Configuration missing for live tests: ${configError.message}. ` +
          'Set AI_PROVIDER_API_KEY and AI_PROVIDER_MODEL in .env to enable.'
        );
      }
    }
  );

  it.skipIf(!liveTestEnabled)('makes real Groq detection request', async () => {
    if (!transport) throw new Error('Transport not configured');

    const detector: GarmentDetector = new RealGroqDetector(transport);
    const testImageUrl = 'https://via.placeholder.com/200x200.jpg?text=Shirt';

    const result = await detector.detect(testImageUrl);

    expect(Array.isArray(result)).toBe(true);
    if (result.length > 0) {
      expect(result[0]).toHaveProperty('category');
      expect(result[0]).toHaveProperty('box');
      expect(result[0]).toHaveProperty('confidence');
      expect(['top', 'bottom', 'footwear', 'outerwear', 'accessory']).toContain(result[0].category);
    }
  });

  it.skipIf(!liveTestEnabled)('makes real Groq extraction request', async () => {
    if (!transport) throw new Error('Transport not configured');

    const extractor: AttributeExtractor = new RealGroqExtractor(transport);
    const testImageUrl = 'https://via.placeholder.com/200x200.jpg?text=BlueShirt';
    const result = await extractor.extract(testImageUrl);

    expect(result).toHaveProperty('attributes');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('confidencePerField');
    expect(result.attributes).toHaveProperty('category');
    expect(result.attributes).toHaveProperty('displayName');
    expect(result.attributes.color).toHaveProperty('primary');
  });

  it.skipIf(!liveTestEnabled)('handles real Groq rate limiting', async () => {
    if (!transport) throw new Error('Transport not configured');

    const detector: GarmentDetector = new RealGroqDetector(transport);
    const testImageUrl = 'https://via.placeholder.com/100x100.jpg';

    try {
      await detector.detect(testImageUrl);
      expect(true).toBe(true);
    } catch (error) {
      if (error instanceof AIProviderError) {
        expect(error.code).toBe('AI_PROVIDER_RATE_LIMIT');
      } else {
        throw error;
      }
    }
  });
});
