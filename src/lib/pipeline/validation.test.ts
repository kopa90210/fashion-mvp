/**
 * Phase 4B Gate 3: Validation Unit Tests
 *
 * Verifies invariant enforcement, exact boundaries, and controlled validation error reporting.
 * Every test records: input, expected result, actual result.
 */

import { describe, expect, it } from 'vitest';
import {
  AIContractValidationError,
  assertValid,
  validateCategory,
  validateConfidence,
  validateCropBox,
  validateDetection,
  validateDetections,
  validateExtractedAttributes,
  validateExtractionResult,
  validateImageUrl,
  validateIsolationResult,
  validateLayerRole,
  validatePrettifyResult,
} from './validation';

describe('Gate 3 Invariant & Contract Validation', () => {
  describe('CropBox Validation & Exact Invariants', () => {
    it('accepts valid CropBox at boundaries: x=0, y=0, x+w=1, y+h=1', () => {
      const input = { x: 0, y: 0, width: 1, height: 1 };
      const expected = { success: true, data: { x: 0, y: 0, width: 1, height: 1 } };
      const actual = validateCropBox(input);

      expect(actual.success).toBe(true);
      if (actual.success) {
        expect(actual.data).toEqual(expected.data);
      }
    });

    it('accepts valid normalized interior CropBox', () => {
      const input = { x: 0.15, y: 0.2, width: 0.5, height: 0.6 };
      const actual = validateCropBox(input);

      expect(actual.success).toBe(true);
      if (actual.success) {
        expect(actual.data.x).toBe(0.15);
        expect(actual.data.width).toBe(0.5);
      }
    });

    it('accepts CropBox immediately below boundary (x + width = 0.999999)', () => {
      const input = { x: 0.6, y: 0.1, width: 0.399999, height: 0.5 };
      const actual = validateCropBox(input);
      expect(actual.success).toBe(true);
    });

    it('accepts CropBox exactly at boundary (x + width = 1.0)', () => {
      const input = { x: 0.6, y: 0.1, width: 0.4, height: 0.5 };
      const actual = validateCropBox(input);
      expect(actual.success).toBe(true);
    });

    it('rejects CropBox immediately above boundary (x + width = 1.000001)', () => {
      const input = { x: 0.6, y: 0.1, width: 0.400001, height: 0.5 };
      const actual = validateCropBox(input);
      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === 'box.x + width')).toBe(true);
      }
    });

    it('accepts CropBox immediately below boundary (y + height = 0.999999)', () => {
      const input = { x: 0.1, y: 0.5, width: 0.5, height: 0.499999 };
      const actual = validateCropBox(input);
      expect(actual.success).toBe(true);
    });

    it('accepts CropBox exactly at boundary (y + height = 1.0)', () => {
      const input = { x: 0.1, y: 0.5, width: 0.5, height: 0.5 };
      const actual = validateCropBox(input);
      expect(actual.success).toBe(true);
    });

    it('rejects CropBox immediately above boundary (y + height = 1.000001)', () => {
      const input = { x: 0.1, y: 0.5, width: 0.5, height: 0.500001 };
      const actual = validateCropBox(input);
      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === 'box.y + height')).toBe(true);
      }
    });

    it('rejects CropBox when x < 0', () => {
      const input = { x: -0.01, y: 0.1, width: 0.5, height: 0.5 };
      const expectedErrorPath = 'box.x';
      const actual = validateCropBox(input);

      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === expectedErrorPath)).toBe(true);
      }
    });

    it('rejects CropBox when x >= 1', () => {
      const input = { x: 1.0, y: 0.1, width: 0.5, height: 0.5 };
      const expectedErrorPath = 'box.x';
      const actual = validateCropBox(input);

      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === expectedErrorPath)).toBe(true);
      }
    });

    it('rejects CropBox when y < 0', () => {
      const input = { x: 0.1, y: -0.2, width: 0.5, height: 0.5 };
      const expectedErrorPath = 'box.y';
      const actual = validateCropBox(input);

      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === expectedErrorPath)).toBe(true);
      }
    });

    it('rejects CropBox when y >= 1', () => {
      const input = { x: 0.1, y: 1.05, width: 0.5, height: 0.5 };
      const expectedErrorPath = 'box.y';
      const actual = validateCropBox(input);

      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === expectedErrorPath)).toBe(true);
      }
    });

    it('rejects CropBox when width <= 0', () => {
      const input = { x: 0.1, y: 0.1, width: 0, height: 0.5 };
      const expectedErrorPath = 'box.width';
      const actual = validateCropBox(input);

      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === expectedErrorPath)).toBe(true);
      }
    });

    it('rejects CropBox when width > 1', () => {
      const input = { x: 0.1, y: 0.1, width: 1.2, height: 0.5 };
      const expectedErrorPath = 'box.width';
      const actual = validateCropBox(input);

      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === expectedErrorPath)).toBe(true);
      }
    });

    it('rejects CropBox when height <= 0', () => {
      const input = { x: 0.1, y: 0.1, width: 0.5, height: -0.1 };
      const expectedErrorPath = 'box.height';
      const actual = validateCropBox(input);

      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === expectedErrorPath)).toBe(true);
      }
    });

    it('rejects CropBox when height > 1', () => {
      const input = { x: 0.1, y: 0.1, width: 0.5, height: 1.5 };
      const expectedErrorPath = 'box.height';
      const actual = validateCropBox(input);

      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === expectedErrorPath)).toBe(true);
      }
    });

    it('rejects non-numeric and non-finite CropBox values (NaN, Infinity, null, strings, arrays)', () => {
      const inputs = [
        { x: NaN, y: 0, width: 0.5, height: 0.5 },
        { x: 0, y: Infinity, width: 0.5, height: 0.5 },
        { x: '0.1', y: 0.2, width: 0.3, height: 0.4 },
        null,
        undefined,
        [0.1, 0.2, 0.3, 0.4],
      ];

      for (const input of inputs) {
        const actual = validateCropBox(input);
        expect(actual.success).toBe(false);
      }
    });
  });

  describe('Confidence Validation', () => {
    it('accepts valid confidence at boundaries: 0, 0.5, 1', () => {
      const inputs = [0, 0.5, 0.999, 1];
      for (const input of inputs) {
        const actual = validateConfidence(input);
        expect(actual.success).toBe(true);
      }
    });

    it('rejects confidence outside [0, 1] and non-numbers', () => {
      const inputs = [-0.1, 1.05, 2, NaN, Infinity, -Infinity, '0.8', null, [0.5]];
      for (const input of inputs) {
        const actual = validateConfidence(input);
        expect(actual.success).toBe(false);
      }
    });
  });

  describe('Image URL Validation', () => {
    it('accepts supported valid image URLs', () => {
      const validUrls = [
        'https://example.com/photo.jpg',
        'http://localhost:3000/image.png',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA',
        'mock://storage/isolated/garment-1.png',
        '/uploads/garment-1.png',
      ];

      for (const url of validUrls) {
        const actual = validateImageUrl(url);
        expect(actual.success).toBe(true);
      }
    });

    it('rejects invalid or empty image URLs without silent fallback', () => {
      const invalidUrls = ['', '   ', 'ftp://example.com/photo.jpg', null, 123, ['url']];
      for (const url of invalidUrls) {
        const actual = validateImageUrl(url);
        expect(actual.success).toBe(false);
      }
    });
  });

  describe('Category Validation', () => {
    it('accepts canonical categories from existing taxonomy', () => {
      const valid = ['top', 'bottom', 'one_piece', 'footwear', 'outerwear', 'accessory'];
      for (const cat of valid) {
        const actual = validateCategory(cat);
        expect(actual.success).toBe(true);
      }
    });

    it('rejects non-canonical categories', () => {
      const invalid = ['shirt', 'pants', 'shoes', 'dress', 'unknown', ''];
      for (const cat of invalid) {
        const actual = validateCategory(cat);
        expect(actual.success).toBe(false);
      }
    });
  });

  describe('Canonical Layer Role Validation', () => {
    it('accepts canonical layer roles', () => {
      const validRoles = ['base_layer', 'bottom', 'one_piece', 'footwear', 'outerwear', 'accessory'];
      for (const role of validRoles) {
        const actual = validateLayerRole(role);
        expect(actual.success).toBe(true);
      }
    });

    it('rejects non-canonical layer roles and aliases', () => {
      const invalidRoles = [
        'mid_layer',
        'shirt',
        'pants',
        'shoes',
        'outer_layer',
        'base',
        'top',
        '',
        123,
        null,
      ];
      for (const role of invalidRoles) {
        const actual = validateLayerRole(role);
        expect(actual.success).toBe(false);
      }
    });
  });

  describe('Detection Validation', () => {
    it('accepts a valid Detection object', () => {
      const input = {
        box: { x: 0.1, y: 0.1, width: 0.8, height: 0.4 },
        category: 'top',
        confidence: 0.95,
        label: 'crewneck sweater',
      };
      const actual = validateDetection(input);
      expect(actual.success).toBe(true);
    });

    it('rejects detection with invalid CropBox or confidence', () => {
      const input = {
        box: { x: 0.9, y: 0.1, width: 0.5, height: 0.4 }, // x + w > 1
        category: 'top',
        confidence: 1.5, // > 1
      };
      const actual = validateDetection(input);
      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('validates a collection of detections and rejects if any are malformed', () => {
      const validCollection = [
        { box: { x: 0, y: 0, width: 0.5, height: 0.5 }, category: 'top', confidence: 0.9 },
        { box: { x: 0.5, y: 0.5, width: 0.5, height: 0.5 }, category: 'bottom', confidence: 0.85 },
      ];
      const actualValid = validateDetections(validCollection);
      expect(actualValid.success).toBe(true);

      const invalidCollection = [
        { box: { x: 0, y: 0, width: 0.5, height: 0.5 }, category: 'top', confidence: 0.9 },
        { box: { x: 0, y: 0, width: 2.0, height: 0.5 }, category: 'invalid', confidence: -1 },
      ];
      const actualInvalid = validateDetections(invalidCollection);
      expect(actualInvalid.success).toBe(false);
    });
  });

  describe('IsolationResult Validation', () => {
    it('accepts valid IsolationResult', () => {
      const input = {
        rawImageUrl: 'https://mock.storage/isolated/garment-1.png',
        box: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        confidence: 0.98,
      };
      const actual = validateIsolationResult(input);
      expect(actual.success).toBe(true);
    });

    it('rejects IsolationResult with invalid image URL or out-of-bounds CropBox', () => {
      const input = {
        rawImageUrl: '',
        box: { x: -0.1, y: 0, width: 0.3, height: 0.4 },
        confidence: 0.98,
      };
      const actual = validateIsolationResult(input);
      expect(actual.success).toBe(false);
    });
  });

  describe('ExtractedAttributes and Numeric Attribute Collections Validation', () => {
    const baseValidAttributes = {
      category: 'top',
      displayName: 'White Oxford Shirt',
      color: { primary: 'white' },
    };

    it('accepts valid ExtractedAttributes containing required fields', () => {
      const actual = validateExtractedAttributes(baseValidAttributes);
      expect(actual.success).toBe(true);
    });

    it('rejects ExtractedAttributes when required fields are missing', () => {
      const missingCategory = { displayName: 'Shirt', color: { primary: 'white' } };
      const missingName = { category: 'top', color: { primary: 'white' } };
      const missingColor = { category: 'top', displayName: 'Shirt' };
      const missingColorPrimary = { category: 'top', displayName: 'Shirt', color: {} };

      expect(validateExtractedAttributes(missingCategory).success).toBe(false);
      expect(validateExtractedAttributes(missingName).success).toBe(false);
      expect(validateExtractedAttributes(missingColor).success).toBe(false);
      expect(validateExtractedAttributes(missingColorPrimary).success).toBe(false);
    });

    it('validates canonical layerRole and rejects non-canonical values', () => {
      const validItem = {
        ...baseValidAttributes,
        layerRole: 'base_layer',
      };
      expect(validateExtractedAttributes(validItem).success).toBe(true);

      const invalidItem = {
        ...baseValidAttributes,
        layerRole: 'shirt',
      };
      const actual = validateExtractedAttributes(invalidItem);
      expect(actual.success).toBe(false);
      if (!actual.success) {
        expect(actual.errors.some((e) => e.path === 'attributes.layerRole')).toBe(true);
      }
    });

    // 1. color.familyWeights tests
    describe('color.familyWeights numeric validation', () => {
      it('accepts valid boundaries 0 and 1 in color.familyWeights', () => {
        const item = {
          ...baseValidAttributes,
          color: {
            primary: 'blue',
            familyWeights: { blue: 1.0, neutral: 0.0, dark: 0.5 },
          },
        };
        expect(validateExtractedAttributes(item).success).toBe(true);
      });

      it('rejects color.familyWeights with value < 0, > 1, NaN, Infinity, -Infinity, string, null', () => {
        const invalidWeights = [-0.1, 1.05, NaN, Infinity, -Infinity, '0.5', null, [0.5]];
        for (const badVal of invalidWeights) {
          const item = {
            ...baseValidAttributes,
            color: {
              primary: 'blue',
              familyWeights: { blue: badVal },
            },
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.color.familyWeights.blue')).toBe(true);
          }
        }
      });

      it('rejects malformed color.familyWeights object structures (array, null, string)', () => {
        const malformedStructures = [[0.5], null, 'dark', 123];
        for (const badStruct of malformedStructures) {
          const item = {
            ...baseValidAttributes,
            color: {
              primary: 'blue',
              familyWeights: badStruct,
            },
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.color.familyWeights')).toBe(true);
          }
        }
      });
    });

    // 2. material.weights tests
    describe('material.weights numeric validation', () => {
      it('accepts valid boundaries 0 and 1 in material.weights', () => {
        const item = {
          ...baseValidAttributes,
          material: {
            primary: 'wool',
            weights: { wool: 1.0, cashmere: 0.0 },
          },
        };
        expect(validateExtractedAttributes(item).success).toBe(true);
      });

      it('rejects material.weights with value < 0, > 1, NaN, Infinity, -Infinity, string, null', () => {
        const invalidWeights = [-0.5, 1.2, NaN, Infinity, -Infinity, '1.0', null, [1]];
        for (const badVal of invalidWeights) {
          const item = {
            ...baseValidAttributes,
            material: {
              weights: { wool: badVal },
            },
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.material.weights.wool')).toBe(true);
          }
        }
      });

      it('rejects malformed material.weights object structures', () => {
        const malformed = [[1], null, 'wool', 42];
        for (const badStruct of malformed) {
          const item = {
            ...baseValidAttributes,
            material: {
              weights: badStruct,
            },
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.material.weights')).toBe(true);
          }
        }
      });
    });

    // 3. fit.weights tests
    describe('fit.weights numeric validation', () => {
      it('accepts valid boundaries 0 and 1 in fit.weights', () => {
        const item = {
          ...baseValidAttributes,
          fit: {
            weights: { slim: 1.0, regular: 0.0, oversized: 0.4 },
          },
        };
        expect(validateExtractedAttributes(item).success).toBe(true);
      });

      it('rejects fit.weights with value < 0, > 1, NaN, Infinity, -Infinity, string, null', () => {
        const invalidWeights = [-0.01, 1.001, NaN, Infinity, -Infinity, '0.8', null, [0.2]];
        for (const badVal of invalidWeights) {
          const item = {
            ...baseValidAttributes,
            fit: {
              weights: { slim: badVal },
            },
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.fit.weights.slim')).toBe(true);
          }
        }
      });

      it('rejects malformed fit.weights object structures', () => {
        const malformed = [[0.5], null, 'slim', true];
        for (const badStruct of malformed) {
          const item = {
            ...baseValidAttributes,
            fit: {
              weights: badStruct,
            },
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.fit.weights')).toBe(true);
          }
        }
      });
    });

    // 4. styleTags tests
    describe('styleTags numeric validation', () => {
      it('accepts valid boundaries 0 and 1 in styleTags', () => {
        const item = {
          ...baseValidAttributes,
          styleTags: { minimal: 1.0, streetwear: 0.0, casual: 0.7 },
        };
        expect(validateExtractedAttributes(item).success).toBe(true);
      });

      it('rejects styleTags with value < 0, > 1, NaN, Infinity, -Infinity, string, null', () => {
        const invalidWeights = [-0.2, 1.5, NaN, Infinity, -Infinity, '0.7', null, [0.7]];
        for (const badVal of invalidWeights) {
          const item = {
            ...baseValidAttributes,
            styleTags: { minimal: badVal },
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.styleTags.minimal')).toBe(true);
          }
        }
      });

      it('rejects malformed styleTags object structures', () => {
        const malformed = [['minimal'], null, 'tag', 99];
        for (const badStruct of malformed) {
          const item = {
            ...baseValidAttributes,
            styleTags: badStruct,
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.styleTags')).toBe(true);
          }
        }
      });
    });

    // 5. seasonWeights tests
    describe('seasonWeights numeric validation', () => {
      it('accepts valid boundaries 0 and 1 in seasonWeights', () => {
        const item = {
          ...baseValidAttributes,
          seasonWeights: { spring: 0.0, summer: 0.5, fall: 0.5, winter: 1.0 },
        };
        expect(validateExtractedAttributes(item).success).toBe(true);
      });

      it('rejects seasonWeights with value < 0, > 1, NaN, Infinity, -Infinity, string, null', () => {
        const invalidWeights = [-0.1, 1.1, NaN, Infinity, -Infinity, '0.5', null, [0.5]];
        for (const badVal of invalidWeights) {
          const item = {
            ...baseValidAttributes,
            seasonWeights: { winter: badVal },
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.seasonWeights.winter')).toBe(true);
          }
        }
      });

      it('rejects malformed seasonWeights object structures', () => {
        const malformed = [['winter'], null, 'summer', 100];
        for (const badStruct of malformed) {
          const item = {
            ...baseValidAttributes,
            seasonWeights: badStruct,
          };
          const res = validateExtractedAttributes(item);
          expect(res.success).toBe(false);
          if (!res.success) {
            expect(res.errors.some((e) => e.path === 'attributes.seasonWeights')).toBe(true);
          }
        }
      });
    });
  });

  describe('ExtractionResult Validation', () => {
    it('accepts valid complete ExtractionResult', () => {
      const input = {
        rawImageUrl: 'https://mock.storage/isolated/item.png',
        confidence: 0.94,
        confidencePerField: {
          category: 0.98,
          displayName: 0.95,
          color: 0.96,
        },
        attributes: {
          category: 'top',
          displayName: 'Navy Blazer',
          color: { primary: 'navy' },
        },
      };
      const actual = validateExtractionResult(input);
      expect(actual.success).toBe(true);
    });

    it('rejects ExtractionResult with out-of-bounds confidence or malformed field scores', () => {
      const input = {
        rawImageUrl: 'https://mock.storage/isolated/item.png',
        confidence: 1.2, // out of range
        confidencePerField: {
          category: -0.5, // out of range
        },
        attributes: {
          category: 'top',
          displayName: 'Navy Blazer',
          color: { primary: 'navy' },
        },
      };
      const actual = validateExtractionResult(input);
      expect(actual.success).toBe(false);
    });
  });

  describe('PrettifyResult Validation & Semantics', () => {
    it('accepts valid PrettifyResult with done status and image URL', () => {
      const input = {
        status: 'done',
        originalImageUrl: 'https://mock.storage/raw.png',
        prettifiedImageUrl: 'https://mock.storage/pretty.png',
        error: null,
      };
      const actual = validatePrettifyResult(input);
      expect(actual.success).toBe(true);
    });

    it('accepts valid PrettifyResult with failed status and error message', () => {
      const input = {
        status: 'failed',
        originalImageUrl: 'https://mock.storage/raw.png',
        prettifiedImageUrl: null,
        error: 'Background enhancement failed',
      };
      const actual = validatePrettifyResult(input);
      expect(actual.success).toBe(true);
    });

    it('accepts valid PrettifyResult with skipped execution status', () => {
      const input = {
        status: 'skipped',
        originalImageUrl: 'https://mock.storage/raw.png',
        prettifiedImageUrl: null,
        error: null,
      };
      const actual = validatePrettifyResult(input);
      expect(actual.success).toBe(true);
    });

    it('rejects PrettifyResult when status is done but prettifiedImageUrl is missing or invalid', () => {
      const input = {
        status: 'done',
        originalImageUrl: 'https://mock.storage/raw.png',
        prettifiedImageUrl: '',
      };
      const actual = validatePrettifyResult(input);
      expect(actual.success).toBe(false);
    });

    it('rejects PrettifyResult when status is failed but error is missing', () => {
      const input = {
        status: 'failed',
        originalImageUrl: 'https://mock.storage/raw.png',
        prettifiedImageUrl: null,
        error: '',
      };
      const actual = validatePrettifyResult(input);
      expect(actual.success).toBe(false);
    });

    it('rejects database persistence statuses (e.g. "none", "processing") as execution status', () => {
      // 'none' and 'processing' are database persistence states, NOT valid execution outputs
      expect(validatePrettifyResult({ status: 'none', originalImageUrl: 'https://mock.storage/raw.png' }).success).toBe(false);
      expect(validatePrettifyResult({ status: 'processing', originalImageUrl: 'https://mock.storage/raw.png' }).success).toBe(false);
    });
  });

  describe('assertValid Helper', () => {
    it('unwraps data when validation succeeds', () => {
      const input = { x: 0.1, y: 0.1, width: 0.5, height: 0.5 };
      const res = validateCropBox(input);
      const unwrapped = assertValid(res, 'CropBox');
      expect(unwrapped.x).toBe(0.1);
    });

    it('throws AIContractValidationError with detailed errors when validation fails', () => {
      const input = { x: -1, y: 0.1, width: 0.5, height: 0.5 };
      const res = validateCropBox(input);

      expect(() => assertValid(res, 'CropBox')).toThrow(AIContractValidationError);
      try {
        assertValid(res, 'CropBox');
      } catch (err) {
        const aiErr = err as AIContractValidationError;
        expect(aiErr.errors.length).toBeGreaterThan(0);
        expect(aiErr.errors[0].path).toBe('box.x');
      }
    });
  });
});
