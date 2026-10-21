import type { ExtractionResult } from '../../contracts';
import { assertValid, validateExtractionResult, validateImageUrl } from '../../validation';
import type { AttributeExtractor } from '../extractor';
import { EXTRACTION_PROMPT } from '../prompts';
import { parseExtractionResponse } from './parsing';
import type { GroqVisionTransport } from './groq-transport';

export class RealGroqExtractor implements AttributeExtractor {
  constructor(private readonly transport: Pick<GroqVisionTransport, 'generate'>) {}

  async extract(rawImageUrl: string): Promise<ExtractionResult> {
    assertValid(validateImageUrl(rawImageUrl, 'rawImageUrl'), 'Extractor input');
    
    // Call Groq vision API
    const raw = await this.transport.generate({
      imageUrl: rawImageUrl,
      prompt: EXTRACTION_PROMPT,
    });

    // Parse response (handles markdown, nested JSON, etc.)
    const parsed = parseExtractionResponse(raw);
    
    // Validate against Gate 3 contract
    return assertValid(validateExtractionResult(parsed), 'RealGroqExtractor');
  }
}

