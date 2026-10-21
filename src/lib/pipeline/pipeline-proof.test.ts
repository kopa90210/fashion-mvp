/**
 * Phase 4B Gate 3: Mock Pipeline Proof & Failure Testing
 *
 * Verifies end-to-end contract composition:
 *   source photo -> MockDetector -> MockIsolator -> MockExtractor -> (optional) MockPrettifier
 *
 * Tests all required failure modes:
 *  - detector failure
 *  - isolator failure
 *  - extractor failure
 *  - prettifier failure
 *  - invalid CropBox
 *  - confidence outside 0..1
 *  - missing required attributes
 *  - malformed provider response
 *  - prettify failure must NOT invalidate extraction result
 *
 * Every test explicitly documents: input, expected result, actual result.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  type Detection,
  type ExtractionResult,
  type IsolationResult,
  type PrettifyResult,
} from './contracts';
import {
  AIContractValidationError,
  assertValid,
  validateDetection,
  validateDetections,
  validateExtractionResult,
  validateIsolationResult,
  validatePrettifyResult,
} from './validation';
import {
  AIProviderError,
  MockDetector,
  MockExtractor,
  MockIsolator,
  MockPrettifier,
} from './ai/mocks';

describe('Gate 3: Mock Pipeline Proof & Composition', () => {
  let detector: MockDetector;
  let isolator: MockIsolator;
  let extractor: MockExtractor;
  let prettifier: MockPrettifier;

  beforeEach(() => {
    detector = new MockDetector();
    isolator = new MockIsolator();
    extractor = new MockExtractor();
    prettifier = new MockPrettifier();
  });

  describe('Contract Composition Proof (Happy Path)', () => {
    it('composes Detection -> Isolation -> Extraction -> Prettify end-to-end', async () => {
      const inputSourcePhotoUrl = 'https://mock.storage/uploads/user-outfit.jpg';

      // 1. Detection Stage
      const rawDetections = await detector.detect(inputSourcePhotoUrl);
      const validatedDetections: Detection[] = assertValid(
        validateDetections(rawDetections),
        'Detection Validation'
      );

      expect(validatedDetections.length).toBe(2);
      expect(validatedDetections[0].category).toBe('top');
      expect(validatedDetections[1].category).toBe('bottom');

      // 2. Isolation Stage (per garment)
      const isolatedGarments: IsolationResult[] = [];
      for (const detection of validatedDetections) {
        const rawIsolation = await isolator.isolate(inputSourcePhotoUrl, detection.box);
        const validatedIsolation: IsolationResult = assertValid(
          validateIsolationResult(rawIsolation),
          'Isolation Validation'
        );
        isolatedGarments.push(validatedIsolation);
      }

      expect(isolatedGarments.length).toBe(2);
      expect(isolatedGarments[0].rawImageUrl).toContain('mock.storage/isolated');
      expect(isolatedGarments[1].rawImageUrl).toContain('mock.storage/isolated');

      // 3. Extraction Stage (per garment)
      const extractedResults: ExtractionResult[] = [];
      for (const isolated of isolatedGarments) {
        const rawExtraction = await extractor.extract(isolated.rawImageUrl);
        const validatedExtraction: ExtractionResult = assertValid(
          validateExtractionResult(rawExtraction),
          'Extraction Validation'
        );
        extractedResults.push(validatedExtraction);
      }

      expect(extractedResults.length).toBe(2);
      expect(extractedResults[0].attributes.category).toBe('top');
      expect(extractedResults[0].attributes.displayName).toBe('Merino Wool Crewneck');
      expect(extractedResults[0].confidence).toBeGreaterThan(0.9);

      // 4. Optional Prettify Stage (per garment)
      const prettifiedResults: PrettifyResult[] = [];
      for (const isolated of isolatedGarments) {
        const rawPrettify = await prettifier.prettify(isolated.rawImageUrl);
        const validatedPrettify: PrettifyResult = assertValid(
          validatePrettifyResult(rawPrettify),
          'Prettify Validation'
        );
        prettifiedResults.push(validatedPrettify);
      }

      expect(prettifiedResults.length).toBe(2);
      expect(prettifiedResults[0].status).toBe('done');
      expect(prettifiedResults[0].prettifiedImageUrl).toBeDefined();

      // Record actual result vs expected
      const actualOutcome = {
        detectionsCount: validatedDetections.length,
        isolatedCount: isolatedGarments.length,
        extractedCount: extractedResults.length,
        prettifiedCount: prettifiedResults.length,
      };
      const expectedOutcome = {
        detectionsCount: 2,
        isolatedCount: 2,
        extractedCount: 2,
        prettifiedCount: 2,
      };
      expect(actualOutcome).toEqual(expectedOutcome);
    });

    it('proves pipeline composition succeeds when optional Prettify is omitted', async () => {
      const inputSourcePhotoUrl = 'https://mock.storage/uploads/user-outfit.jpg';

      // Stage 1: Detect
      const detections = assertValid(validateDetections(await detector.detect(inputSourcePhotoUrl)));
      // Stage 2: Isolate
      const isolation = assertValid(validateIsolationResult(await isolator.isolate(inputSourcePhotoUrl, detections[0].box)));
      // Stage 3: Extract
      const extraction = assertValid(validateExtractionResult(await extractor.extract(isolation.rawImageUrl)));

      // Optional stage omitted - pipeline result is complete and valid
      expect(extraction.attributes.category).toBe('top');
      expect(extraction.attributes.displayName).toBe('Merino Wool Crewneck');
    });
  });

  describe('Failure Testing', () => {
    it('handles detector failure via controlled AIProviderError', async () => {
      const input = 'https://mock.storage/uploads/bad-photo.jpg';
      detector.setMode('failure', 'Detector model timeout');

      let thrownError: unknown = null;
      try {
        await detector.detect(input);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(AIProviderError);
      const providerError = thrownError as AIProviderError;
      expect(providerError.providerName).toBe('MockDetector');
      expect(providerError.message).toContain('Detector model timeout');
    });

    it('handles isolator failure via controlled AIProviderError', async () => {
      const inputUrl = 'https://mock.storage/uploads/photo.jpg';
      const inputBox = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
      isolator.setMode('failure', 'Isolation segmentation fault');

      let thrownError: unknown = null;
      try {
        await isolator.isolate(inputUrl, inputBox);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(AIProviderError);
      const providerError = thrownError as AIProviderError;
      expect(providerError.providerName).toBe('MockIsolator');
      expect(providerError.message).toContain('Isolation segmentation fault');
    });

    it('handles extractor failure via controlled AIProviderError', async () => {
      const inputUrl = 'https://mock.storage/isolated/garment.png';
      extractor.setMode('failure', 'Extractor rate limit exceeded');

      let thrownError: unknown = null;
      try {
        await extractor.extract(inputUrl);
      } catch (err) {
        thrownError = err;
      }

      expect(thrownError).toBeInstanceOf(AIProviderError);
      const providerError = thrownError as AIProviderError;
      expect(providerError.providerName).toBe('MockExtractor');
      expect(providerError.message).toContain('Extractor rate limit exceeded');
    });

    it('proves prettifier failure does NOT invalidate the extraction result', async () => {
      const inputUrl = 'https://mock.storage/isolated/garment.png';

      // Extractor succeeds
      const extraction = assertValid(validateExtractionResult(await extractor.extract(inputUrl)));
      expect(extraction.attributes.displayName).toBe('Merino Wool Crewneck');

      // Prettifier returns failure status
      prettifier.setMode('failure', 'Enhancement service unavailable');
      const prettifyRes = assertValid(validatePrettifyResult(await prettifier.prettify(inputUrl)));

      // Assert prettify failed gracefully
      expect(prettifyRes.status).toBe('failed');
      expect(prettifyRes.prettifiedImageUrl).toBeNull();
      expect(prettifyRes.error).toBe('Enhancement service unavailable');

      // Crucial invariant: Extraction result remains fully valid and intact
      expect(extraction.attributes.category).toBe('top');
      expect(extraction.confidence).toBeGreaterThan(0.9);
    });

    it('rejects malformed detector response and does not silently fall back', async () => {
      detector.setMode('malformed');
      const malformedDetections = await detector.detect('https://mock.storage/uploads/photo.jpg');

      const validationRes = validateDetections(malformedDetections);
      expect(validationRes.success).toBe(false);

      expect(() => assertValid(validationRes, 'Detector')).toThrow(AIContractValidationError);
    });

    it('rejects malformed isolator response without silent repair', async () => {
      isolator.setMode('malformed');
      const malformedIsolation = await isolator.isolate('https://mock.storage/uploads/photo.jpg', {
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
      });

      const validationRes = validateIsolationResult(malformedIsolation);
      expect(validationRes.success).toBe(false);

      expect(() => assertValid(validationRes, 'Isolator')).toThrow(AIContractValidationError);
    });

    it('rejects malformed extractor response missing required attributes', async () => {
      extractor.setMode('malformed');
      const malformedExtraction = await extractor.extract('https://mock.storage/isolated/garment.png');

      const validationRes = validateExtractionResult(malformedExtraction);
      expect(validationRes.success).toBe(false);

      expect(() => assertValid(validationRes, 'Extractor')).toThrow(AIContractValidationError);
    });

    it('rejects malformed prettifier response', async () => {
      prettifier.setMode('malformed');
      const malformedPrettify = await prettifier.prettify('https://mock.storage/isolated/garment.png');

      const validationRes = validatePrettifyResult(malformedPrettify);
      expect(validationRes.success).toBe(false);

      expect(() => assertValid(validationRes, 'Prettifier')).toThrow(AIContractValidationError);
    });

    it('rejects confidence outside 0..1 in detection', () => {
      const invalidDetection = {
        box: { x: 0.1, y: 0.1, width: 0.5, height: 0.5 },
        category: 'top',
        confidence: 1.05, // > 1.0
      };

      const res = validateDetection(invalidDetection);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.some((e) => e.path.includes('confidence'))).toBe(true);
      }
    });

    it('rejects CropBox invariant violation (x + width > 1)', () => {
      const invalidCropBoxDetection = {
        box: { x: 0.7, y: 0.1, width: 0.5, height: 0.5 }, // 0.7 + 0.5 = 1.2 > 1
        category: 'top',
        confidence: 0.95,
      };

      const res = validateDetection(invalidCropBoxDetection);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.errors.some((e) => e.path.includes('x + width'))).toBe(true);
      }
    });
  });
});
