/**
 * Profile Style Studio — Core Types
 *
 * Types for Saved Looks, Canonical Worn History, Garment Membership,
 * Account Identity, Real Summary Counts, and Style Passport.
 */

export interface ProfileGarment {
  id: string
  displayName: string
  category: string | null
  layerRole: string | null
  imageUrl: string | null
  slot: string
  position: number
  isRetired?: boolean
  isMissing?: boolean
}

export interface ProfileOutfitLook {
  id: string
  source: 'engine' | 'daily_ai' | 'daily_fallback' | 'manual' | 'swap' | 'calibration'
  status: 'generated' | 'superseded' | 'invalid'
  createdAt: string
  scheduledFor: string | null
  stylingTip: string | null
  reasons: string[]
  items: ProfileGarment[]
}

export interface SavedLookEntry {
  outfitId: string
  savedAt: string
  savedAtDisplay?: string
  outfit: ProfileOutfitLook
}

export interface WornLookEntry {
  wearRecordId: string
  wornOn: string // Calendar date YYYY-MM-DD
  wornOnDisplay?: string
  recordedAt: string
  outfit: ProfileOutfitLook
}

export interface PaginatedResult<T> {
  items: T[]
  nextCursor: string | null
  hasMore: boolean
}

/** Authenticated user display identity derived from verified account fields */
export interface ProfileAccount {
  id: string
  email: string | null
  displayName: string
  initials: string
  avatarUrl?: string | null
}

/** Summary counts across the full user dataset */
export interface ProfileCounts {
  /** Total active confirmed wardrobe items in the user's closet (null if unavailable) */
  wardrobePieces: number | null
  /** Total saved lookbook outfits (null if unavailable) */
  savedLooks: number | null
  /** Total canonical times worn, excluding undone records (null if unavailable) */
  timesWorn: number | null
}

/** Stored onboarding quiz signal with canonical question and answer labels */
export interface QuizSignalItem {
  key: string
  label: string
  valueKey: string
  valueLabel: string
}

/** Style Passport card data derived from Fashion DNA and quiz signals */
export interface ProfileStylePassport {
  /** Strongest style tags ordered by ranking weight descending (no percentages) */
  topStyles: Array<{ key: string; label: string; weight: number }>
  /** Canonical five quiz signals if available; null for older users or unrecorded profiles */
  quizSignals: QuizSignalItem[] | null
  /** True if the user has any style vector or quiz signals */
  hasStyleData: boolean
  /** Short factual caption */
  caption: string
}

/** Stored signature look pinned by the user (preserved for schema/RPC compatibility) */
export interface SignatureLookData {
  outfitId: string
  version: number
  pinnedAt: string
  outfit: ProfileOutfitLook
}

/** Complete profile studio aggregate data */
export interface ProfileStudioSummary {
  account: ProfileAccount
  counts: ProfileCounts
  passport: ProfileStylePassport
  signatureLook?: SignatureLookData | null
}
