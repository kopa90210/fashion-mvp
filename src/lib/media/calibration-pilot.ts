import pilotMapData from './calibration-pilot-map.json'

type PilotAssetEntry = {
  source_relative_path: string
  source_sha256: string
  normalized_url: string
  normalized_sha256: string
  status: string
  original_size: number[]
  normalized_size: number[]
  crop_box: number[]
  safety_margin_px: number
}

const pilotMap: Record<string, PilotAssetEntry> = pilotMapData as unknown as Record<string, PilotAssetEntry>

/**
 * Resolves a wardrobe item image URL to its tightly bounded local display copy
 * for the Calibration-only trial.
 *
 * Scoped strictly to Calibration (`calibration === true` in FlatLay).
 * Other consumers (Today, Profile, Wardrobe) continue to use original URLs.
 *
 * Uses strict source identity matching:
 * - Exact source relative path (e.g. "feminine/one_piece/1791293379.png")
 * - Exact storage filename boundary (e.g. ".../wardrobe-images/1791293379.png" or "/1791293379.png")
 * - Disallows partial substring matches (e.g. query params, hashes, or unrelated files containing digits)
 *
 * @param originalUrl - The original garment image URL (remote Supabase, relative, or test path)
 * @returns The normalized local pilot URL if matched, or originalUrl as fallback
 */
export function resolveCalibrationPilotImageUrl(originalUrl: string | null | undefined): string | null {
  if (!originalUrl || typeof originalUrl !== 'string') return null

  // Strip query string and fragment for path inspection
  const cleanUrl = originalUrl.split('?')[0].split('#')[0].trim()
  const pathSegments = cleanUrl.split('/').filter(Boolean)
  const filename = pathSegments[pathSegments.length - 1] ?? ''

  for (const [assetId, entry] of Object.entries(pilotMap)) {
    // 1. Exact relative path match (e.g. "feminine/one_piece/1791293379.png" or ending with it)
    if (
      cleanUrl === entry.source_relative_path ||
      cleanUrl === `/${entry.source_relative_path}` ||
      cleanUrl.endsWith(`/${entry.source_relative_path}`)
    ) {
      return entry.normalized_url
    }

    // 2. Exact filename match at path boundary (e.g. "/1791293379.png" or ".../wardrobe-images/1791293379.png")
    // Must be exact filename equal to "<assetId>.png", not a substring of another filename
    if (filename === `${assetId}.png` || filename === assetId) {
      return entry.normalized_url
    }
  }

  return originalUrl
}

export function getPilotAssetMetadata(assetId: string): PilotAssetEntry | null {
  return pilotMap[assetId] ?? null
}
