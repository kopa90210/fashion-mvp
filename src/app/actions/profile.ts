'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/server'
import {
  deletePrivateObject,
  signedOwnedPrivatePreviewUrl,
  uploadValidatedPrivateImage,
} from '@/src/lib/media/private-media'
import {
  formatProfileCalendarDate,
  formatProfileTimestamp,
} from '@/src/lib/profile/dates'
import type {
  ProfileGarment,
  ProfileOutfitLook,
  SavedLookEntry,
  WornLookEntry,
  PaginatedResult,
  ProfileAccount,
  ProfileCounts,
  ProfileStylePassport,
  ProfileStudioSummary,
  SignatureLookData,
} from '@/src/lib/profile/types'
import { deriveDisplayNameAndInitials } from '@/src/lib/profile/account'
import { formatQuizSignals } from '@/src/lib/profile/quiz-signals'
import { normalizeWardrobeItem } from '@/src/lib/wardrobe/normalize'
import { readQuizSignals } from '@/src/lib/quiz/scoring'
import { vectorToSignals } from '@/src/lib/fashion-dna/labels'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getAuthenticatedUser() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    throw new Error('Not authenticated')
  }
  return { supabase, user }
}

function parseSavedCursor(cursor?: string): { createdAt: string; outfitId: string } | null {
  if (!cursor) return null
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8')
    const parsed = JSON.parse(raw)
    if (parsed.createdAt && parsed.outfitId) {
      return { createdAt: parsed.createdAt, outfitId: parsed.outfitId }
    }
    return null
  } catch {
    return null
  }
}

function encodeSavedCursor(createdAt: string, outfitId: string): string {
  return Buffer.from(JSON.stringify({ createdAt, outfitId }), 'utf8').toString('base64')
}

function parseWornCursor(cursor?: string): { wornOn: string; wearRecordId: string } | null {
  if (!cursor) return null
  try {
    const raw = Buffer.from(cursor, 'base64').toString('utf8')
    const parsed = JSON.parse(raw)
    if (parsed.wornOn && parsed.wearRecordId) {
      return { wornOn: parsed.wornOn, wearRecordId: parsed.wearRecordId }
    }
    return null
  } catch {
    return null
  }
}

function encodeWornCursor(wornOn: string, wearRecordId: string): string {
  return Buffer.from(JSON.stringify({ wornOn, wearRecordId }), 'utf8').toString('base64')
}

/**
 * Shared helper to map raw outfit query rows to ProfileOutfitLook,
 * prioritizing server-captured garment snapshots so that historical combinations
 * survive garment deletion.
 * Resolves private signed image URLs securely and flags missing/retired pieces.
 */
async function resolveProfileOutfit(
  rawOutfit: Record<string, unknown>,
  supabase: Awaited<ReturnType<typeof createClient>>,
  retiredItemIds: Set<string>,
  garmentSnapshot?: unknown,
): Promise<ProfileOutfitLook> {
  // If a server-captured snapshot exists, use it to guarantee historical composition
  if (Array.isArray(garmentSnapshot) && garmentSnapshot.length > 0) {
    const sorted = [...garmentSnapshot].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))
    const items: ProfileGarment[] = await Promise.all(
      sorted.map(async (snap: Record<string, unknown>) => {
        const mediaAssetId = snap.media_asset_id ? String(snap.media_asset_id) : null
        let resolvedImageUrl: string | null = (snap.image_url as string | null) ?? null

        if (mediaAssetId) {
          try {
            resolvedImageUrl = await signedOwnedPrivatePreviewUrl(supabase, mediaAssetId)
          } catch {
            resolvedImageUrl = (snap.image_url as string | null) ?? null
          }
        }

        const normalized = normalizeWardrobeItem({
          category: snap.category as string,
          subcategory: snap.subcategory as string,
          display_name: snap.display_name as string,
          layer_role: (snap.layer_role as string) ?? (snap.slot as string),
        })

        const itemId = snap.wardrobe_item_id ? String(snap.wardrobe_item_id) : 'snapshot-item'
        return {
          id: itemId,
          displayName: (snap.display_name as string) ?? 'Wardrobe piece',
          category: normalized.category,
          layerRole: normalized.layer_role,
          imageUrl: resolvedImageUrl,
          slot: (snap.slot as string) ?? normalized.layer_role,
          position: Number(snap.position ?? 0),
          isRetired: retiredItemIds.has(itemId),
          isMissing: !resolvedImageUrl,
        }
      }),
    )

    return {
      id: String(rawOutfit.id),
      source: (rawOutfit.source as ProfileOutfitLook['source']) ?? 'engine',
      status: (rawOutfit.status as ProfileOutfitLook['status']) ?? 'generated',
      createdAt: String(rawOutfit.created_at ?? ''),
      scheduledFor: (rawOutfit.scheduled_for as string | null) ?? null,
      stylingTip: (rawOutfit.styling_tip as string | null) ?? null,
      reasons: Array.isArray(rawOutfit.reasoning) ? (rawOutfit.reasoning as string[]) : [],
      items,
    }
  }

  // Fallback for pre-snapshot legacy outfits
  const rawItems = Array.isArray(rawOutfit.outfit_items) ? rawOutfit.outfit_items : []
  const sorted = [...rawItems].sort((a, b) => Number(a.position ?? 0) - Number(b.position ?? 0))

  const items: ProfileGarment[] = await Promise.all(
    sorted.map(async (oi: Record<string, unknown>) => {
      const wi = (Array.isArray(oi.wardrobe_items) ? oi.wardrobe_items[0] : oi.wardrobe_items) as Record<string, unknown> | null
      if (!wi) {
        return {
          id: 'missing',
          displayName: 'Unavailable piece',
          category: null,
          layerRole: (oi.slot as string) ?? null,
          imageUrl: null,
          slot: (oi.slot as string) ?? 'base_layer',
          position: Number(oi.position ?? 0),
          isMissing: true,
        }
      }

      const mediaAssetId = wi.media_asset_id ? String(wi.media_asset_id) : null
      let resolvedImageUrl: string | null = (wi.image_url as string | null) ?? null

      if (mediaAssetId) {
        try {
          resolvedImageUrl = await signedOwnedPrivatePreviewUrl(supabase, mediaAssetId)
        } catch {
          resolvedImageUrl = (wi.image_url as string | null) ?? null
        }
      }

      const normalized = normalizeWardrobeItem({
        category: wi.category as string,
        subcategory: wi.subcategory as string,
        display_name: wi.display_name as string,
        layer_role: (wi.layer_role as string) ?? (oi.slot as string),
      })

      const itemId = String(wi.id)
      return {
        id: itemId,
        displayName: (wi.display_name as string) ?? 'Wardrobe piece',
        category: normalized.category,
        layerRole: normalized.layer_role,
        imageUrl: resolvedImageUrl,
        slot: (oi.slot as string) ?? normalized.layer_role,
        position: Number(oi.position ?? 0),
        isRetired: retiredItemIds.has(itemId),
        isMissing: !resolvedImageUrl && Boolean(mediaAssetId),
      }
    }),
  )

  return {
    id: String(rawOutfit.id),
    source: (rawOutfit.source as ProfileOutfitLook['source']) ?? 'engine',
    status: (rawOutfit.status as ProfileOutfitLook['status']) ?? 'generated',
    createdAt: String(rawOutfit.created_at ?? ''),
    scheduledFor: (rawOutfit.scheduled_for as string | null) ?? null,
    stylingTip: (rawOutfit.styling_tip as string | null) ?? null,
    reasons: Array.isArray(rawOutfit.reasoning) ? (rawOutfit.reasoning as string[]) : [],
    items,
  }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** Save an eligible outfit to the user's private lookbook. */
export async function saveOutfitLook(outfitId: string): Promise<{ success: boolean; savedAt: string }> {
  if (!UUID_REGEX.test(outfitId)) throw new Error('Invalid outfit ID')
  const { supabase } = await getAuthenticatedUser()

  const { data, error } = await supabase.rpc('save_outfit_look', { p_outfit_id: outfitId })
  if (error || !data) {
    throw new Error(error?.message || 'Could not save outfit')
  }

  revalidatePath('/profile')
  revalidatePath('/outfits')
  return { success: true, savedAt: String(data) }
}

/** Unsave an outfit from the user's lookbook. Idempotent. */
export async function unsaveOutfitLook(outfitId: string): Promise<{ success: boolean }> {
  if (!UUID_REGEX.test(outfitId)) throw new Error('Invalid outfit ID')
  const { supabase } = await getAuthenticatedUser()

  const { error } = await supabase.rpc('unsave_outfit_look', { p_outfit_id: outfitId })
  if (error) {
    throw new Error(error.message || 'Could not unsave outfit')
  }

  revalidatePath('/profile')
  revalidatePath('/outfits')
  return { success: true }
}

/** Check if an outfit is currently saved by the user. */
export async function isOutfitSaved(outfitId: string): Promise<boolean> {
  if (!UUID_REGEX.test(outfitId)) return false
  const { supabase, user } = await getAuthenticatedUser()

  const { data, error } = await supabase
    .from('saved_outfits')
    .select('outfit_id')
    .eq('user_id', user.id)
    .eq('outfit_id', outfitId)
    .maybeSingle()

  if (error) return false
  return Boolean(data)
}

/**
 * Record an outfit as worn on a specific date (or user timezone date if omitted).
 * Executes in a single transactional database RPC with atomic behavioral recording.
 */
export async function recordWear(
  outfitId: string,
  wornOn?: string,
  idempotencyKey?: string,
): Promise<{ success: boolean; wearRecordId: string; wornOn: string; replayed?: boolean; undone?: boolean }> {
  if (!UUID_REGEX.test(outfitId)) throw new Error('Invalid outfit ID')
  if (wornOn && !DATE_REGEX.test(wornOn)) throw new Error('Invalid date format')

  const { supabase } = await getAuthenticatedUser()
  const clientKey = idempotencyKey ?? `profile:worn:${outfitId}:${wornOn ?? 'today'}`

  const { data, error } = await supabase.rpc('record_canonical_outfit_worn', {
    p_outfit_id: outfitId,
    p_worn_on: wornOn ?? null,
    p_idempotency_key: clientKey,
  })

  if (error || !data) {
    throw new Error(error?.message || 'Could not record wear')
  }

  const res = data as {
    id?: string | null
    worn_on?: string | null
    interaction_id?: string | null
    replayed?: boolean
    undone?: boolean
  }

  revalidatePath('/profile')
  revalidatePath('/outfits')
  return {
    success: !res.undone && Boolean(res.id),
    wearRecordId: res.id ?? '',
    wornOn: res.worn_on ?? '',
    replayed: res.replayed ?? false,
    undone: res.undone ?? false,
  }
}

/** Correct an existing wear record's date. Throws on date conflict. */
export async function changeWearDate(
  wearRecordId: string,
  newDate: string,
): Promise<{ success: boolean; wearRecordId: string; wornOn: string }> {
  if (!UUID_REGEX.test(wearRecordId)) throw new Error('Invalid wear record ID')
  if (!DATE_REGEX.test(newDate)) throw new Error('Invalid date format (must be YYYY-MM-DD)')

  const { supabase } = await getAuthenticatedUser()

  const { data, error } = await supabase.rpc('update_outfit_wear_date', {
    p_wear_record_id: wearRecordId,
    p_new_worn_on: newDate,
  })

  if (error || !data) {
    if (error?.code === '23505' || error?.message?.includes('already marked as worn')) {
      throw new Error('This outfit was already marked as worn on this date')
    }
    throw new Error(error?.message || 'Could not update wear date')
  }

  const parsed = data as { id: string; worn_on: string }

  revalidatePath('/profile')
  return { success: true, wearRecordId: parsed.id, wornOn: parsed.worn_on }
}

/** Undo a previously recorded wear instance. Idempotent deletion. */
export async function undoWear(wearRecordId: string): Promise<{ success: boolean }> {
  if (!UUID_REGEX.test(wearRecordId)) throw new Error('Invalid wear record ID')
  const { supabase } = await getAuthenticatedUser()

  const { error } = await supabase.rpc('undo_outfit_worn', {
    p_wear_record_id: wearRecordId,
  })

  if (error) {
    throw new Error(error.message || 'Could not undo wear record')
  }

  revalidatePath('/profile')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Reads & Queries
// ---------------------------------------------------------------------------

/** Paginated saved looks ordered by saved timestamp descending. */
export async function getSavedLooks(
  cursor?: string,
  limit = 8,
): Promise<PaginatedResult<SavedLookEntry>> {
  const boundedLimit = Math.max(1, Math.min(50, limit))
  const { supabase, user } = await getAuthenticatedUser()

  let query = supabase
    .from('saved_outfits')
    .select(
      'created_at, outfit_id, garment_snapshot, outfits!inner(id, source, status, created_at, scheduled_for, styling_tip, reasoning, outfit_items(slot, position, wardrobe_items(id, display_name, category, layer_role, image_url, media_asset_id, status)))',
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .order('outfit_id', { ascending: false })
    .limit(boundedLimit + 1)

  const parsedCursor = parseSavedCursor(cursor)
  if (parsedCursor) {
    query = query.or(
      `created_at.lt.${parsedCursor.createdAt},and(created_at.eq.${parsedCursor.createdAt},outfit_id.lt.${parsedCursor.outfitId})`,
    )
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Could not fetch saved looks: ${error.message}`)
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const hasMore = rows.length > boundedLimit
  const sliced = hasMore ? rows.slice(0, boundedLimit) : rows

  // Extract all item IDs to check retirement status
  const allItemIds: string[] = []
  for (const row of sliced) {
    if (Array.isArray(row.garment_snapshot) && row.garment_snapshot.length > 0) {
      for (const snap of row.garment_snapshot as Array<Record<string, unknown>>) {
        if (snap.wardrobe_item_id) allItemIds.push(String(snap.wardrobe_item_id))
      }
    } else {
      const outfit = row.outfits as Record<string, unknown> | null
      const items = Array.isArray(outfit?.outfit_items) ? outfit.outfit_items : []
      for (const item of items) {
        const wi = (Array.isArray(item.wardrobe_items) ? item.wardrobe_items[0] : item.wardrobe_items) as Record<string, unknown> | null
        if (wi?.id) allItemIds.push(String(wi.id))
      }
    }
  }

  const retiredItemIds = new Set<string>()
  if (allItemIds.length > 0) {
    const { data: ownershipRows } = await supabase
      .from('user_wardrobe_items')
      .select('item_id, retired_at')
      .eq('user_id', user.id)
      .in('item_id', allItemIds)

    for (const o of ownershipRows ?? []) {
      if (o.retired_at) retiredItemIds.add(String(o.item_id))
    }
  }

  // Fetch user timezone for consistent date formatting
  let timeZone = 'UTC'
  try {
    const userQuery = supabase.from('users')
    if (typeof userQuery?.select === 'function') {
      const { data: userRow } = await userQuery
        .select('timezone')
        .eq('id', user.id)
        .maybeSingle()
      if (userRow?.timezone) timeZone = (userRow as { timezone?: string }).timezone || 'UTC'
    }
  } catch {
    timeZone = 'UTC'
  }

  const items: SavedLookEntry[] = await Promise.all(
    sliced.map(async (row) => {
      const outfit = await resolveProfileOutfit(
        row.outfits as Record<string, unknown>,
        supabase,
        retiredItemIds,
        row.garment_snapshot,
      )
      return {
        outfitId: String(row.outfit_id),
        savedAt: String(row.created_at),
        savedAtDisplay: formatProfileTimestamp(String(row.created_at), timeZone, {
          includeYear: true,
          style: 'dayMonthYear',
        }),
        outfit,
      }
    }),
  )

  let nextCursor: string | null = null
  if (hasMore && sliced.length > 0) {
    const last = sliced[sliced.length - 1]
    nextCursor = encodeSavedCursor(String(last.created_at), String(last.outfit_id))
  }

  return { items, nextCursor, hasMore }
}

/** Paginated worn history ordered by worn_on date descending. */
export async function getWornLooksHistory(
  cursor?: string,
  limit = 8,
): Promise<PaginatedResult<WornLookEntry>> {
  const boundedLimit = Math.max(1, Math.min(50, limit))
  const { supabase, user } = await getAuthenticatedUser()

  let query = supabase
    .from('outfit_wear_records')
    .select(
      'id, worn_on, created_at, outfit_id, garment_snapshot, outfits!inner(id, source, status, created_at, scheduled_for, styling_tip, reasoning, outfit_items(slot, position, wardrobe_items(id, display_name, category, layer_role, image_url, media_asset_id, status)))',
    )
    .eq('user_id', user.id)
    .order('worn_on', { ascending: false })
    .order('id', { ascending: false })
    .limit(boundedLimit + 1)

  const parsedCursor = parseWornCursor(cursor)
  if (parsedCursor) {
    query = query.or(
      `worn_on.lt.${parsedCursor.wornOn},and(worn_on.eq.${parsedCursor.wornOn},id.lt.${parsedCursor.wearRecordId})`,
    )
  }

  const { data, error } = await query
  if (error) {
    throw new Error(`Could not fetch worn history: ${error.message}`)
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>
  const hasMore = rows.length > boundedLimit
  const sliced = hasMore ? rows.slice(0, boundedLimit) : rows

  // Extract all item IDs to check retirement status
  const allItemIds: string[] = []
  for (const row of sliced) {
    if (Array.isArray(row.garment_snapshot) && row.garment_snapshot.length > 0) {
      for (const snap of row.garment_snapshot as Array<Record<string, unknown>>) {
        if (snap.wardrobe_item_id) allItemIds.push(String(snap.wardrobe_item_id))
      }
    } else {
      const outfit = row.outfits as Record<string, unknown> | null
      const items = Array.isArray(outfit?.outfit_items) ? outfit.outfit_items : []
      for (const item of items) {
        const wi = (Array.isArray(item.wardrobe_items) ? item.wardrobe_items[0] : item.wardrobe_items) as Record<string, unknown> | null
        if (wi?.id) allItemIds.push(String(wi.id))
      }
    }
  }

  const retiredItemIds = new Set<string>()
  if (allItemIds.length > 0) {
    const { data: ownershipRows } = await supabase
      .from('user_wardrobe_items')
      .select('item_id, retired_at')
      .eq('user_id', user.id)
      .in('item_id', allItemIds)

    for (const o of ownershipRows ?? []) {
      if (o.retired_at) retiredItemIds.add(String(o.item_id))
    }
  }

  const items: WornLookEntry[] = await Promise.all(
    sliced.map(async (row) => {
      const outfit = await resolveProfileOutfit(
        row.outfits as Record<string, unknown>,
        supabase,
        retiredItemIds,
        row.garment_snapshot,
      )
      return {
        wearRecordId: String(row.id),
        wornOn: String(row.worn_on),
        wornOnDisplay: formatProfileCalendarDate(String(row.worn_on), {
          includeYear: true,
          style: 'dayMonthYear',
        }),
        recordedAt: String(row.created_at),
        outfit,
      }
    }),
  )

  let nextCursor: string | null = null
  if (hasMore && sliced.length > 0) {
    const last = sliced[sliced.length - 1]
    nextCursor = encodeWornCursor(String(last.worn_on), String(last.id))
  }

  return { items, nextCursor, hasMore }
}

/**
 * Gate 2: Fetch profile summary data including:
 * - Verified account identity with neutral fallback
 * - Full-dataset counts for wardrobe pieces, saved looks, and times worn
 * - Style Passport data derived from Fashion DNA and canonical quiz signals
 *
 * Uses Promise.allSettled to ensure that partial query failures do not break
 * other sections and return honest null/unavailable states rather than fabricated numbers.
 */
export async function getProfileSummary(): Promise<ProfileStudioSummary> {
  const { supabase, user } = await getAuthenticatedUser()

  const { displayName, initials } = deriveDisplayNameAndInitials(user)
  const avatarAssetId = (user.user_metadata?.avatar_asset_id as string | undefined) ?? null
  let avatarUrl: string | null = null

  if (avatarAssetId) {
    try {
      avatarUrl = await signedOwnedPrivatePreviewUrl(supabase, avatarAssetId)
    } catch {
      avatarUrl = null
    }
  }

  const account: ProfileAccount = {
    id: user.id,
    email: user.email ?? null,
    displayName,
    initials,
    avatarUrl,
  }

  // Fetch full-dataset counts and Fashion DNA in parallel (initial signature fetch removed from UI)
  const [wardrobeRes, savedRes, wearRes, dnaRes] = await Promise.allSettled([
    supabase
      .from('user_wardrobe_items')
      .select('item_id, wardrobe_items!inner(id)', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('wardrobe_items.status', 'confirmed')
      .is('retired_at', null),
    supabase
      .from('saved_outfits')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('outfit_wear_records')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('fashion_dna')
      .select('vector, quiz_signals')
      .eq('user_id', user.id)
      .maybeSingle(),
  ])

  const counts: ProfileCounts = {
    wardrobePieces:
      wardrobeRes.status === 'fulfilled' && !wardrobeRes.value.error
        ? wardrobeRes.value.count ?? 0
        : null,
    savedLooks:
      savedRes.status === 'fulfilled' && !savedRes.value.error
        ? savedRes.value.count ?? 0
        : null,
    timesWorn:
      wearRes.status === 'fulfilled' && !wearRes.value.error
        ? wearRes.value.count ?? 0
        : null,
  }

  let topStyles: Array<{ key: string; label: string; weight: number }> = []
  let quizSignals: ReturnType<typeof formatQuizSignals> = null

  if (dnaRes.status === 'fulfilled' && !dnaRes.value.error && dnaRes.value.data) {
    const rawVector = (dnaRes.value.data.vector ?? {}) as Record<string, number>
    topStyles = vectorToSignals(rawVector, 4)
    const rawSignals = readQuizSignals(dnaRes.value.data.quiz_signals)
    quizSignals = formatQuizSignals(rawSignals)
  }

  const hasStyleData = topStyles.length > 0 || quizSignals !== null

  const passport: ProfileStylePassport = {
    topStyles,
    quizSignals,
    hasStyleData,
    caption: 'Based on your style choices.',
  }

  return { account, counts, passport, signatureLook: null }
}

/**
 * Gate 3: Read current signature look with resolved garment imagery.
 * Handles missing garment media honestly and survives outfit unsaving/undo.
 */
export async function getSignatureLook(): Promise<SignatureLookData | null> {
  const { supabase, user } = await getAuthenticatedUser()

  const { data, error } = await supabase
    .from('user_signature_looks')
    .select(
      'outfit_id, version, pinned_at, garment_snapshot, outfit_snapshot, outfits(id, source, status, created_at, scheduled_for, styling_tip, reasoning, outfit_items(slot, position, wardrobe_items(id, display_name, category, layer_role, image_url, media_asset_id, status)))',
    )
    .eq('user_id', user.id)
    .maybeSingle()

  if (error || !data || !data.outfit_id) {
    return null
  }

  const rawJoinedOutfits = Array.isArray(data.outfits) ? data.outfits[0] : data.outfits
  const outfitRaw = (rawJoinedOutfits as unknown as Record<string, unknown> | null) ?? {}
  const status = outfitRaw.status as string | undefined

  if (status === 'invalid') {
    return null
  }

  // Extract all item IDs to check retirement status
  const allItemIds: string[] = []
  if (Array.isArray(data.garment_snapshot) && data.garment_snapshot.length > 0) {
    for (const snap of data.garment_snapshot as Array<Record<string, unknown>>) {
      if (snap.wardrobe_item_id) allItemIds.push(String(snap.wardrobe_item_id))
    }
  }

  const retiredItemIds = new Set<string>()
  if (allItemIds.length > 0) {
    const { data: ownershipRows } = await supabase
      .from('user_wardrobe_items')
      .select('item_id, retired_at')
      .eq('user_id', user.id)
      .in('item_id', allItemIds)

    for (const o of ownershipRows ?? []) {
      if (o.retired_at) retiredItemIds.add(String(o.item_id))
    }
  }

  const mergedOutfit = {
    id: data.outfit_id,
    ...(data.outfit_snapshot as Record<string, unknown>),
    ...outfitRaw,
  }

  const outfit = await resolveProfileOutfit(
    mergedOutfit,
    supabase,
    retiredItemIds,
    data.garment_snapshot,
  )

  return {
    outfitId: String(data.outfit_id),
    version: Number(data.version ?? 1),
    pinnedAt: String(data.pinned_at),
    outfit,
  }
}

/**
 * Gate 3: Set or replace the user's single signature look.
 * Concurrency-safe via transaction advisory lock and version checking.
 * Captures server-authorized garment snapshots to survive unsave/undo.
 */
export async function setSignatureLook(
  outfitId: string,
  expectedVersion?: number,
): Promise<{ success: boolean; outfitId: string; version: number; pinnedAt: string }> {
  if (!outfitId || !UUID_REGEX.test(outfitId)) {
    throw new Error('Invalid outfit ID')
  }

  const { supabase } = await getAuthenticatedUser()

  const { data, error } = await supabase.rpc('set_signature_look', {
    p_outfit_id: outfitId,
    p_expected_version: expectedVersion ?? null,
  })

  if (error) {
    if (error.code === '40900') {
      throw new Error('Signature look was modified in another session. Please refresh and try again.')
    }
    throw new Error(`Could not set signature look: ${error.message}`)
  }

  revalidatePath('/profile')

  return {
    success: true,
    outfitId: String(data.outfit_id),
    version: Number(data.version),
    pinnedAt: String(data.pinned_at),
  }
}

/**
 * Gate 3: Unpin the signature look.
 * Independent of wear history and saved look membership.
 */
export async function clearSignatureLook(
  expectedVersion?: number,
): Promise<{ success: boolean; version: number }> {
  const { supabase } = await getAuthenticatedUser()

  const { data, error } = await supabase.rpc('clear_signature_look', {
    p_expected_version: expectedVersion ?? null,
  })

  if (error) {
    if (error.code === '40900') {
      throw new Error('Signature look was modified in another session. Please refresh and try again.')
    }
    throw new Error(`Could not remove signature look: ${error.message}`)
  }

  revalidatePath('/profile')

  return {
    success: true,
    version: Number(data?.version ?? 0),
  }
}

/**
 * Functional sign out action.
 * Terminates Supabase session and redirects to /login.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  redirect('/login')
}

/**
 * Upload and set a new profile avatar photo.
 * Validates decoded image content, size, MIME, and dimensions server-side via sharp.
 * Enforces authenticated owner path and updates user metadata before deleting any old avatar asset.
 */
export async function uploadAvatarAction(
  formData: FormData,
): Promise<{ success: boolean; avatarUrl: string | null }> {
  const { supabase, user } = await getAuthenticatedUser()
  const file = formData.get('avatar') as File | null
  if (!file || !(file instanceof File) || file.size === 0) {
    throw new Error('No avatar image provided')
  }

  // Validates format (JPEG/PNG/WebP), <=10MB, <=20MP, decoded dimensions, and uploads to user private path
  const media = await uploadValidatedPrivateImage(supabase, user.id, file)

  const { data: asset, error: assetError } = await supabase
    .from('media_assets')
    .insert({
      owner_id: user.id,
      bucket_id: media.bucket,
      object_path: media.path,
      kind: 'source_photo',
      mime_type: media.mimeType,
      byte_size: media.byteSize,
      sha256: media.sha256,
      width: media.width,
      height: media.height,
    })
    .select('id')
    .single()

  if (assetError || !asset) {
    await deletePrivateObject(supabase, user.id, media.path)
    throw new Error(assetError?.message || 'Could not record avatar media asset')
  }

  const oldAssetId = (user.user_metadata?.avatar_asset_id as string | undefined) ?? null

  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_asset_id: asset.id },
  })

  if (updateError) {
    await supabase.from('media_assets').delete().eq('id', asset.id)
    await deletePrivateObject(supabase, user.id, media.path)
    throw new Error(updateError.message || 'Could not update profile avatar reference')
  }

  // Cleanup old avatar only AFTER the new reference is safely persisted
  if (oldAssetId && oldAssetId !== asset.id) {
    try {
      const { data: oldAsset } = await supabase
        .from('media_assets')
        .select('object_path')
        .eq('id', oldAssetId)
        .eq('owner_id', user.id)
        .maybeSingle()

      if (oldAsset?.object_path) {
        await supabase.from('media_assets').delete().eq('id', oldAssetId)
        await deletePrivateObject(supabase, user.id, oldAsset.object_path)
      }
    } catch (cleanupErr) {
      console.warn('Could not clean up previous avatar asset', cleanupErr)
    }
  }

  const avatarUrl = await signedOwnedPrivatePreviewUrl(supabase, asset.id)
  revalidatePath('/profile')
  return { success: true, avatarUrl }
}

/**
 * Remove the current profile avatar photo, reverting to initials fallback.
 * Updates the user reference first, then safely removes the storage asset.
 */
export async function removeAvatarAction(): Promise<{ success: boolean }> {
  const { supabase, user } = await getAuthenticatedUser()
  const oldAssetId = (user.user_metadata?.avatar_asset_id as string | undefined) ?? null

  if (!oldAssetId) {
    return { success: true }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    data: { avatar_asset_id: null },
  })

  if (updateError) {
    throw new Error(updateError.message || 'Could not remove avatar reference')
  }

  try {
    const { data: oldAsset } = await supabase
      .from('media_assets')
      .select('object_path')
      .eq('id', oldAssetId)
      .eq('owner_id', user.id)
      .maybeSingle()

    if (oldAsset?.object_path) {
      await supabase.from('media_assets').delete().eq('id', oldAssetId)
      await deletePrivateObject(supabase, user.id, oldAsset.object_path)
    }
  } catch (cleanupErr) {
    console.warn('Could not clean up removed avatar asset', cleanupErr)
  }

  revalidatePath('/profile')
  return { success: true }
}
