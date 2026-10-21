/**
 * Phase 4B Gate 3: Garment Detector Interface
 *
 * Provider-independent interface for garment detection within a source image.
 * Independent of Groq, Gemini, rembg, or persistence SDKs.
 */

import type { Detection } from '../contracts';

export interface GarmentDetector {
  detect(imageUrl: string): Promise<Detection[]>;
}
