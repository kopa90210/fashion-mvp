/**
 * Phase 4B Gate 3: Garment Isolator Interface
 *
 * Provider-independent interface for garment cropping and background isolation.
 * Independent of rembg, external microservices, or persistence SDKs.
 */

import type { CropBox, IsolationResult } from '../contracts';

export interface GarmentIsolator {
  isolate(
    imageUrl: string,
    box: CropBox
  ): Promise<IsolationResult>;
}
