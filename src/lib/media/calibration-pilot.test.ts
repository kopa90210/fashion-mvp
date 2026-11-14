import { describe, expect, it } from 'vitest'
import {
  resolveCalibrationPilotImageUrl,
  getPilotAssetMetadata,
} from './calibration-pilot'

describe('calibration pilot image resolution', () => {
  it('resolves verified assets by exact relative path, filename, or storage URL', () => {
    // 1. Jumpsuit
    expect(
      resolveCalibrationPilotImageUrl('feminine/one_piece/1791293379.png'),
    ).toBe('/pilot-normalized/feminine/one_piece/1791293379.png')

    expect(
      resolveCalibrationPilotImageUrl(
        'https://svbkadgcpbpnbfzaqvsf.supabase.co/storage/v1/object/public/wardrobe-images/1791293379.png',
      ),
    ).toBe('/pilot-normalized/feminine/one_piece/1791293379.png')

    // 2. Glasses
    expect(
      resolveCalibrationPilotImageUrl('feminine/accessories/1791293965.png'),
    ).toBe('/pilot-normalized/feminine/accessories/1791293965.png')

    // 3. Footwear
    expect(
      resolveCalibrationPilotImageUrl('feminine/footwear/1791293593.png'),
    ).toBe('/pilot-normalized/feminine/footwear/1791293593.png')
  })

  it('rejects unrelated URLs that merely contain the numeric ID as a substring or query parameter', () => {
    // Substring in filename
    expect(
      resolveCalibrationPilotImageUrl('https://cdn.example.com/shoes_1791293379_large.png'),
    ).toBe('https://cdn.example.com/shoes_1791293379_large.png')

    // In query parameter
    expect(
      resolveCalibrationPilotImageUrl('https://example.com/search?ref=1791293379&type=item.png'),
    ).toBe('https://example.com/search?ref=1791293379&type=item.png')

    // In unrelated folder path
    expect(
      resolveCalibrationPilotImageUrl('https://example.com/1791293379/random-garment.jpg'),
    ).toBe('https://example.com/1791293379/random-garment.jpg')
  })

  it('safely falls back to the original URL for unknown items and non-curated assets', () => {
    expect(resolveCalibrationPilotImageUrl('https://images.unsplash.com/photo-1234')).toBe(
      'https://images.unsplash.com/photo-1234',
    )
    expect(resolveCalibrationPilotImageUrl('/unknown-item.png')).toBe('/unknown-item.png')
    expect(resolveCalibrationPilotImageUrl(null)).toBeNull()
    expect(resolveCalibrationPilotImageUrl(undefined)).toBeNull()
  })

  it('provides verified metadata for all 9 normalized pilot assets', () => {
    const meta = getPilotAssetMetadata('1791293379')
    expect(meta).not.toBeNull()
    expect(meta?.status).toBe('transparent_normalized')
    expect(meta?.original_size).toEqual([1664, 928])
    const size = meta!.normalized_size
    expect(size[0]).toBeLessThan(size[1])
    expect(meta?.safety_margin_px).toBe(8)
  })
})
