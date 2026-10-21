import type { Detection } from '../../contracts';
import { assertValid, validateDetections, validateImageUrl } from '../../validation';
import type { GarmentDetector } from '../detector';
import { DETECTION_PROMPT } from '../prompts';
import { parseDetectionResponse } from './parsing';
import type { GroqVisionTransport } from './groq-transport';

export class RealGroqDetector implements GarmentDetector {
  constructor(private readonly transport: Pick<GroqVisionTransport, 'generate'>) {}

  async detect(imageUrl: string): Promise<Detection[]> {
    assertValid(validateImageUrl(imageUrl, 'imageUrl'), 'Detector input');
    
    // Call Groq vision API
    const raw = await this.transport.generate({
      imageUrl,
      prompt: DETECTION_PROMPT,
    });

    // Parse response (handles markdown, nested JSON, etc.)
    const parsed = parseDetectionResponse(raw);
    
    // Validate against Gate 3 contract
    return assertValid(validateDetections(parsed), 'RealGroqDetector');
  }
}

