/**
 * Phase 4B Gate 4: Image Cropping Utility
 *
 * Performs local, server-side image cropping using normalized bounding boxes.
 * Uses sharp for Node.js server-side image processing.
 * No external API calls required.
 *
 * Supports:
 *   - HTTP/HTTPS URLs (fetches and crops)
 *   - Local file paths
 *   - Normalized box coordinates (0..1)
 *
 * Returns a base64-encoded PNG of the cropped region.
 */

import type { CropBox } from '../../contracts';

/**
 * Crops an image using a normalized CropBox.
 *
 * Implementation uses sharp for Node.js server-side processing.
 * Fetches image from URL, crops to normalized box region, returns as base64 PNG.
 *
 * @param imageUrl - Image URL or local file path
 * @param box - Normalized bounding box [0..1]
 * @returns Base64-encoded PNG of cropped region
 * @throws Error if image cannot be loaded or cropping fails
 */
export async function cropImage(imageUrl: string, box: CropBox): Promise<string> {
  // Defensive validation
  if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) {
    throw new Error('Invalid crop box: coordinates must be normalized');
  }
  if (box.x + box.width > 1 || box.y + box.height > 1) {
    throw new Error('Invalid crop box: box exceeds image bounds');
  }

  try {
    // Dynamically import sharp (Node.js only)
    const sharp = await import('sharp');
    const sharpLib = sharp.default;

    // Fetch image or load from path
    let imageBuffer: Buffer;

    if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      // Fetch from URL
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      imageBuffer = Buffer.from(await response.arrayBuffer());
    } else {
      // Load from local file system
      const fs = await import('fs/promises');
      imageBuffer = await fs.readFile(imageUrl);
    }

    // Get image metadata to convert normalized coords to pixels
    const metadata = await sharpLib(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error('Cannot determine image dimensions');
    }

    // Convert normalized box to pixel coordinates
    const pixelX = Math.round(box.x * metadata.width);
    const pixelY = Math.round(box.y * metadata.height);
    const pixelWidth = Math.round(box.width * metadata.width);
    const pixelHeight = Math.round(box.height * metadata.height);

    // Crop and encode as PNG
    const croppedBuffer = await sharpLib(imageBuffer)
      .extract({
        left: pixelX,
        top: pixelY,
        width: pixelWidth,
        height: pixelHeight,
      })
      .png()
      .toBuffer();

    // Return as base64 data URL
    return `data:image/png;base64,${croppedBuffer.toString('base64')}`;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Image cropping failed: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Legacy variant for reference.
 * Kept for backward compatibility but delegates to main cropImage().
 *
 * @deprecated Use cropImage() instead; it now handles Node.js natively
 */
export async function cropImageNodeServer(
  imageUrl: string,
  box: CropBox
): Promise<string> {
  return cropImage(imageUrl, box);
}
