/**
 * Phase 4B Gate 3: Attribute Extractor Interface
 *
 * Provider-independent interface for extracting structured fashion attributes
 * from an isolated garment crop.
 * Independent of Groq, OpenAI, Gemini, or persistence SDKs.
 */

import type { ExtractionResult } from '../contracts';

export interface AttributeExtractor {
  extract(
    rawImageUrl: string
  ): Promise<ExtractionResult>;
}
