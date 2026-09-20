import { AIContractValidationError, assertValid, validateDetections, validateExtractionResult, validateIsolationResult, validatePrettifyResult } from '../../validation';
import type { Detection, ExtractionResult, IsolationResult, PrettifyResult } from '../../contracts';

/**
 * Unwraps provider responses that may be wrapped in markdown or nested objects.
 * Handles:
 *   - Raw JSON objects/arrays
 *   - JSON wrapped in markdown: ```json {...} ```
 *   - Nested wrapping in common envelope keys
 */
function unwrap(payload: unknown): unknown {
  if (typeof payload !== 'string') {
    if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const value = payload as Record<string, unknown>;
      // Try common envelope keys
      for (const key of ['detections', 'result', 'data', 'output', 'content', 'text']) {
        if (key in value && value[key] !== undefined) return unwrap(value[key]);
      }
    }
    return payload;
  }

  // Strip markdown if present
  const trimmed = payload.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new AIContractValidationError(
      'Provider response was not valid JSON',
      [{ path: 'response', message: 'Expected valid JSON', received: payload }]
    );
  }
}

/**
 * Generic parser that validates using a provided validator.
 */
function parse<T>(
  payload: unknown,
  validate: (value: unknown) => { success: true; data: T } | { success: false; errors: { path: string; message: string; received?: unknown }[] },
  context: string
): T {
  return assertValid(validate(unwrap(payload)), context);
}

/**
 * Parse detection response.
 * Groq returns a string with JSON.
 * May wrap in markdown or nested object.
 */
export function parseDetectionResponse(payload: unknown): Detection[] {
  const unwrapped = unwrap(payload);
  
  // Handle both direct array and object with detections key
  const detections = 
    Array.isArray(unwrapped) 
      ? unwrapped 
      : unwrapped && typeof unwrapped === 'object' && 'detections' in unwrapped
        ? (unwrapped as Record<string, unknown>).detections
        : null;

  if (!Array.isArray(detections)) {
    throw new AIContractValidationError(
      'Detection provider response did not contain array or {detections: [...]}',
      [{ path: 'response', message: 'Expected detection array', received: payload }]
    );
  }

  return parse(detections, validateDetections, 'Detection provider response');
}

export function parseIsolationResponse(payload: unknown): IsolationResult {
  return parse(payload, validateIsolationResult, 'Isolation provider response');
}

export function parseExtractionResponse(payload: unknown): ExtractionResult {
  return parse(payload, validateExtractionResult, 'Extraction provider response');
}

export function parsePrettifyResponse(payload: unknown): PrettifyResult {
  return parse(payload, validatePrettifyResult, 'Prettify provider response');
}
