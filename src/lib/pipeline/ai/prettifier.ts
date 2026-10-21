/**
 * Phase 4B Gate 3: Garment Prettifier Interface
 *
 * Provider-independent interface for optional garment restyling or enhancement.
 * Independent of external AI image models or persistence SDKs.
 */

import type { PrettifyResult } from '../contracts';

export interface GarmentPrettifier {
  prettify(
    rawImageUrl: string
  ): Promise<PrettifyResult>;
}
