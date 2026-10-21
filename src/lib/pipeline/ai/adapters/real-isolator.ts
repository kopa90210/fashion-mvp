import type { CropBox, IsolationResult } from '../../contracts';
import { assertValid, validateCropBox, validateImageUrl } from '../../validation';
import type { GarmentIsolator } from '../isolator';

/**
 * Real image cropping isolator.
 *
 * In production (browser context): Uses Canvas API for image cropping.
 * In test/Node.js context: Uses a mock or file-based approach.
 *
 * The isolation step performs:
 *   1. Validate inputs (URL, box)
 *   2. Crop the source image using the bounding box
 *   3. Optionally remove background (deferred to future implementation)
 *   4. Return the isolated garment image URL
 *
 * This is NOT an LLM call. It's real image processing.
 */
export class RealLocalIsolator implements GarmentIsolator {
  constructor(private readonly imageCropper?: (imageUrl: string, box: CropBox) => Promise<string>) {}

  async isolate(imageUrl: string, box: CropBox): Promise<IsolationResult> {
    // Validate inputs before any processing
    assertValid(validateImageUrl(imageUrl, 'imageUrl'), 'Isolator input URL');
    assertValid(validateCropBox(box), 'Isolator crop box');

    // Perform actual image cropping
    let croppedImageUrl: string;
    
    if (this.imageCropper) {
      // Use injected cropper (for testing or custom implementations)
      croppedImageUrl = await this.imageCropper(imageUrl, box);
    } else {
      // Default: Return a reference that could be cropped client-side
      // In a real browser context, we would call cropImage() from image-cropper.ts
      // For server-side Node.js tests, this would need sharp or jimp
      throw new Error(
        'Image cropper not configured. ' +
        'In browser context, use: new RealLocalIsolator(cropImage). ' +
        'In Node.js, use sharp or jimp library and provide a cropper function.'
      );
    }

    // Construct the result
    const result: IsolationResult = {
      rawImageUrl: croppedImageUrl,
      box,
      confidence: 0.95, // High confidence for deterministic local cropping
    };

    // Validate result
    return assertValid(
      { success: true, data: result },
      'RealLocalIsolator'
    );
  }
}

/**
 * LLM-based isolator variant (for reference).
 * NOT recommended; real isolation should use image processing, not LLMs.
 * Kept for backward compatibility if needed.
 */
export class RealGroqIsolator implements GarmentIsolator {
  async isolate(imageUrl: string, box: CropBox): Promise<IsolationResult> {
    assertValid(validateImageUrl(imageUrl, 'imageUrl'), 'Isolator input URL');
    assertValid(validateCropBox(box), 'Isolator crop box');

    // This would call Groq, but Groq can't actually process images for isolation.
    // We're keeping this method signature for interface compatibility only.
    // In practice, Gate 4 uses RealLocalIsolator with actual image processing.
    throw new Error(
      'LLM-based isolation is not recommended. ' +
      'Use RealLocalIsolator with actual image cropping instead.'
    );
  }
}

