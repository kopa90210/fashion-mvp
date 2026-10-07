'use server'

import { createClient } from '@/src/lib/supabase/server'
import {
  recommendOutfits,
  outfitKey,
  scoreOutfit,
  type Outfit,
  type WardrobeItem,
  type LayerRole,
} from '@/src/lib/outfit/engine'
import type { StyleVector } from '@/src/lib/quiz/scoring'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeWardrobeItem } from '@/src/lib/wardrobe/normalize'
import type { GeneratedDailyOutfit } from '@/src/lib/outfit/ai-service'
import { signedOwnedPrivateUrl } from '@/src/lib/media/private-media'

export type DailyOutfit = Outfit & {
  id: string
  vector: StyleVector
  reasons: string[]
}

export type CalibrationOutfit = Outfit & {
  id: string
  vector: StyleVector
  reasons: string[]
}

const STYLE_LABELS: Record<string, string> = {
  minimal: 'clean, simple pieces',
  streetwear: 'relaxed streetwear',
  formal: 'polished shapes',
  bohemian: 'easy bohemian details',
  edgy: 'sharper pieces',
  earth_tones: 'earth tones',
}

type WardrobeJoinItem = {
  id: string
  display_name: string
  image_url: string | null
  media_asset_id: string | null
  status: 'confirmed' | 'draft' | 'rejected'
  category: string | null
  subcategory: string | null
  layer_role: string | null
  style_tags: Partial<StyleVector> | null
}

type UserWardrobeJoinRow = {
  retired_at: string | null
  wardrobe_items: WardrobeJoinItem | WardrobeJoinItem[] | null
}

type StoredDailyOutfitRow = {
  id: string
  item_ids: string[] | null
  reasoning: string[] | null
  outfit_items?: Array<{ wardrobe_item_id: string; position: number }> | null
}

function localCalendarDate(timezone: string, instant = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant)
  const value = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]))
  return `${value.year}-${value.month}-${value.day}`
}

function buildReasons(outfit: Outfit, dna: StyleVector) {
  const outfitTags = new Set(
    outfit.items.flatMap((item) =>
      Object.entries(item.style_tags)
        .filter(([, weight]) => typeof weight === 'number' && weight > 0)
        .map(([tag]) => tag),
    ),
  )

  return Object.entries(dna)
    .filter(([tag, weight]) => outfitTags.has(tag) && weight >= 0.45)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => `because you liked ${STYLE_LABELS[tag] ?? tag.replaceAll('_', ' ')}`)
}

function resolveStoredDailyOutfit(
  stored: StoredDailyOutfitRow,
  items: WardrobeItem[],
  dna: StyleVector,
): DailyOutfit | null {
  const relationalIds = Array.isArray(stored.outfit_items)
    ? [...stored.outfit_items].sort((a, b) => a.position - b.position).map((item) => item.wardrobe_item_id)
    : null
  const itemIds = relationalIds?.length ? relationalIds : stored.item_ids
  if (!Array.isArray(itemIds)) return null

  const itemsById = new Map(items.map((item) => [item.id, item]))
  const resolvedItems = itemIds.map((id) => itemsById.get(id))

  if (resolvedItems.some((item) => !item)) {
    return null
  }

  const outfitItems = resolvedItems as WardrobeItem[]
  return {
    id: stored.id,
    items: outfitItems,
    score: scoreOutfit(outfitItems, dna),
    vector: dna,
    reasons: Array.isArray(stored.reasoning) ? stored.reasoning : [],
  }
}

async function getStoredDailyOutfit(
  supabase: SupabaseClient,
  userId: string,
  items: WardrobeItem[],
  dna: StyleVector,
  scheduledFor: string,
) {
  const { data } = await supabase
    .from('outfits')
    .select('id, item_ids, reasoning, outfit_items(wardrobe_item_id, position)')
    .eq('user_id', userId)
    .in('source', ['daily_ai', 'daily_fallback'])
    .eq('scheduled_for', scheduledFor)
    .eq('status', 'generated')
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) {
    return null
  }

  return resolveStoredDailyOutfit(data as StoredDailyOutfitRow, items, dna)
}

async function persistOutfit(supabase: SupabaseClient, outfit: Outfit, source: 'engine' | 'daily_ai' | 'daily_fallback', reasons: string[], generated: GeneratedDailyOutfit | null, contextSnapshot: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc('create_outfit_with_items', {
    p_item_ids: outfit.items.map((item) => item.id), p_source: source, p_reasoning: reasons,
    p_styling_tip: generated?.styling_tip ?? null, p_confidence: generated?.confidence ?? null,
    p_generator_version: generated ? 'fastapi-daily-v1' : 'deterministic-engine-v1', p_context_snapshot: contextSnapshot,
  })
  if (error || !data) throw new Error(`Failed to save outfit: ${error?.message ?? 'unknown error'}`)
  return data as string
}

async function persistCalibrationOutfit(
  supabase: SupabaseClient,
  outfit: Outfit,
  reasons: string[],
) {
  const { data, error } = await supabase.rpc('create_calibration_outfit_with_items', {
    p_item_ids: outfit.items.map((item) => item.id),
    p_reasoning: reasons,
    p_context_snapshot: { relationship: 'style_seed' },
  })
  if (error || !data) throw new Error(`Failed to save calibration outfit: ${error?.message ?? 'unknown error'}`)
  return data as string
}


function pickDiverseCalibrationCandidate(
  candidates: Outfit[],
  excludeKeys: Set<string>,
  currentItemIds: string[] = [],
) {
  const currentIds = new Set(currentItemIds)

  return (
    candidates.find((candidate) => {
      const key = outfitKey(candidate.items)
      if (excludeKeys.has(key)) return false
      return !candidate.items.some((item) => currentIds.has(item.id))
    }) ??
    candidates.find((candidate) => !excludeKeys.has(outfitKey(candidate.items))) ??
    candidates[0]
  )
}

async function getAuthedUserId() {
  const supabase = await createClient()
  const { data: userData, error: authError } = await supabase.auth.getUser()

  if (authError || !userData?.user) {
    throw new Error('Not authenticated')
  }

  return { supabase, userId: userData.user.id }
}

/**
 * Item-id sets of every outfit already shown to this user, optionally scoped
 * to a "since" time. Used to avoid repeating daily and calibration looks.
 */
async function getShownOutfitKeys(
  supabase: SupabaseClient,
  userId: string,
  since?: Date,
): Promise<Set<string>> {
  let query = supabase.from('outfits').select('item_ids').eq('user_id', userId)
  if (since) {
    query = query.gte('created_at', since.toISOString())
  }

  const { data } = await query
  const rows = (data ?? []) as { item_ids: string[] }[]

  return new Set(
    rows.map((row) => outfitKey(row.item_ids.map((id) => ({ id })))),
  )
}

/**
 * Single source of truth for fetching this user's wardrobe in the shape the
 * recommendation engine expects.
 */
async function fetchRelationshipItems(
  supabase: SupabaseClient,
  userId: string,
  relationshipTable: 'user_wardrobe_items' | 'user_style_seed_items',
): Promise<WardrobeItem[]> {
  const { data: rows, error: itemsError } = await supabase
    .from(relationshipTable)
    .select(
      `
      retired_at,
      wardrobe_items (
        id,
        display_name,
        image_url,
        media_asset_id,
        status,
        category,
        subcategory,
        layer_role,
        style_tags
      )
      `,
    )
    .eq('user_id', userId)

  if (itemsError || !rows) {
    console.error(`outfit action - ${relationshipTable} fetch error:`, itemsError)
    throw new Error('Could not fetch outfit items')
  }

  const normalizedRows = (rows as UserWardrobeJoinRow[])
    .filter((row) => !row.retired_at)
    .map((row) => Array.isArray(row.wardrobe_items) ? row.wardrobe_items[0] : row.wardrobe_items)
    .filter((item): item is WardrobeJoinItem => item != null && item.status === 'confirmed')

  let excludedCount = 0
  const items = await Promise.all(normalizedRows.map(async (item) => {
    const normalized = normalizeWardrobeItem(item)
    if (!normalized.layer_role) excludedCount += 1
    return {
      id: item.id,
      display_name: item.display_name,
      image_url: item.media_asset_id
        ? await signedOwnedPrivateUrl(supabase, item.media_asset_id)
        : item.image_url ?? null,
      layer_role: normalized.layer_role as LayerRole,
      style_tags: (item.style_tags as Partial<StyleVector>) ?? {},
    }
  }))
  if (excludedCount > 0) {
    console.warn(`outfit action - excluded ${relationshipTable} items with unmapped layer_role:`, excludedCount)
  }
  return items
}

async function fetchOwnedWardrobeItems(
  supabase: SupabaseClient,
  userId: string,
): Promise<WardrobeItem[]> {
  return fetchRelationshipItems(supabase, userId, 'user_wardrobe_items')
}

async function fetchStyleSeedItems(
  supabase: SupabaseClient,
  userId: string,
): Promise<WardrobeItem[]> {
  return fetchRelationshipItems(supabase, userId, 'user_style_seed_items')
}

async function getUserDnaAndWardrobeInternal(
  supabase: SupabaseClient,
  userId: string,
) {
  const [dnaResult, items, userResult] = await Promise.all([
    supabase
      .from('fashion_dna')
      .select('vector')
      .eq('user_id', userId)
      .single(),
    fetchOwnedWardrobeItems(supabase, userId),
    supabase.from('users').select('timezone').eq('id', userId).single(),
  ])

  if (dnaResult.error || !dnaResult.data) {
    console.error('outfit action - DNA fetch error:', dnaResult.error)
    throw new Error('Fashion DNA not found')
  }

  return {
    supabase,
    userId,
    dna: dnaResult.data.vector as StyleVector,
    items,
    timezone: typeof userResult.data?.timezone === 'string' ? userResult.data.timezone : 'UTC',
  }
}

async function getUserDnaAndWardrobe() {
  const { supabase, userId } = await getAuthedUserId()
  return getUserDnaAndWardrobeInternal(supabase, userId)
}

async function getUserDnaAndStyleSeedsInternal(
  supabase: SupabaseClient,
  userId: string,
) {
  const [dnaResult, items] = await Promise.all([
    supabase
      .from('fashion_dna')
      .select('vector')
      .eq('user_id', userId)
      .single(),
    fetchStyleSeedItems(supabase, userId),
  ])

  if (dnaResult.error || !dnaResult.data) {
    console.error('outfit action - DNA fetch error:', dnaResult.error)
    throw new Error('Fashion DNA not found')
  }

  return {
    supabase,
    userId,
    dna: dnaResult.data.vector as StyleVector,
    items,
  }
}

async function getUserDnaAndStyleSeeds() {
  const { supabase, userId } = await getAuthedUserId()
  return getUserDnaAndStyleSeedsInternal(supabase, userId)
}

/**
 * Fetch the calling user's wardrobe items + fashion DNA, run the
 * recommendation engine, and return the top N outfits.
 *
 * Scoped exclusively to user_wardrobe_items; never queries the full catalog.
 */
export async function getRecommendedOutfits(topN = 5): Promise<Outfit[]> {
  const { dna, items } = await getUserDnaAndWardrobe()
  return recommendOutfits(items, dna, { topN })
}

export async function shouldShowOutfitCalibration(): Promise<boolean> {
  const { supabase, userId } = await getAuthedUserId()

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('has_completed_calibration')
    .eq('id', userId)
    .single()

  if (userError || userRow?.has_completed_calibration) {
    return false
  }

  const { dna, items } = await getUserDnaAndStyleSeedsInternal(supabase, userId)
  return recommendOutfits(items, dna, { topN: 3 }).length >= 1
}

export async function getCalibrationOutfits(): Promise<CalibrationOutfit[]> {
  const { supabase, userId, dna, items } = await getUserDnaAndStyleSeeds()

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('has_completed_calibration')
    .eq('id', userId)
    .single()

  if (userError || userRow?.has_completed_calibration) {
    return []
  }

  const candidates = recommendOutfits(items, dna, { topN: 6 })
  if (candidates.length === 0) {
    return []
  }

  const savedOutfits: CalibrationOutfit[] = []

  for (const candidate of candidates.slice(0, 3)) {
    const savedOutfitId = await persistCalibrationOutfit(supabase, candidate, buildReasons(candidate, dna))

    savedOutfits.push({
      ...candidate,
      id: savedOutfitId,
      vector: dna,
      reasons: buildReasons(candidate, dna),
    })
  }

  return savedOutfits
}

export async function getDailyOutfit(): Promise<DailyOutfit | null> {
  const t0 = performance.now()
  const { supabase, userId, dna, items, timezone } = await getUserDnaAndWardrobe()
  const tData = performance.now() - t0

  const scheduledFor = localCalendarDate(timezone)

  if (process.env.ENABLE_AI_DAILY_OUTFITS === 'true') {
    const storedOutfit = await getStoredDailyOutfit(supabase, userId, items, dna, scheduledFor)
    if (storedOutfit) {
      if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_PERF === 'true') {
        console.log(`[outfit] total=${Math.round(performance.now() - t0)}ms data=${Math.round(tData)}ms hit=stored_daily`)
      }
      return storedOutfit
    }
  }

  const excludeKeys = await getShownOutfitKeys(supabase, userId)

  const tEngine0 = performance.now()
  const candidates = recommendOutfits(items, dna, { topN: 10 })
  const tEngine = performance.now() - tEngine0

  const outfit =
    candidates.find((candidate) => !excludeKeys.has(outfitKey(candidate.items))) ??
    candidates[0]
  if (!outfit) {
    return null
  }

  let queuedJobId: string | null = null
  if (process.env.ENABLE_AI_DAILY_OUTFITS === 'true') {
    const { data: jobId, error: queueError } = await supabase.rpc('enqueue_daily_outfit_job')
    if (!queueError && typeof jobId === 'string') queuedJobId = jobId
    else console.warn('[outfit] daily AI enqueue failed; using engine')
  }

  const tInsert0 = performance.now()
  const reasons = buildReasons(outfit, dna)
  const savedOutfitId = await persistOutfit(supabase, outfit, 'engine', reasons, null,
    queuedJobId ? { ai_job_id: queuedJobId, fallback_reason: 'ai_queued' } : {})
  const tInsert = performance.now() - tInsert0

  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_PERF === 'true') {
    console.log(
      `[outfit] total=${Math.round(performance.now() - t0)}ms data=${Math.round(tData)}ms engine=${tEngine.toFixed(2)}ms persistence=${Math.round(tInsert)}ms candidates=${candidates.length}`,
    )
  }

  return {
    ...outfit,
    id: savedOutfitId,
    vector: dna,
    reasons,
  }
}

export async function submitOutfitFeedback(
  outfitId: string,
  liked: boolean,
  idempotencyKey: string,
): Promise<{ vector: StyleVector; changedTags: string[] }> {
  const result = await applyOutfitFeedback(outfitId, liked, 'daily', false, idempotencyKey)
  return { vector: result.vector, changedTags: result.changedTags }
}

export async function submitCalibrationFeedback(
  outfitId: string,
  liked: boolean,
  isFinalOutfit: boolean,
  idempotencyKey: string,
): Promise<{ vector: StyleVector; changedTags: string[]; nextOutfit?: CalibrationOutfit }> {
  return applyOutfitFeedback(outfitId, liked, 'calibration', isFinalOutfit, idempotencyKey)
}

export async function skipOutfitCalibration(): Promise<{ success: boolean }> {
  const { supabase, userId } = await getAuthedUserId()

  const { error } = await supabase
    .from('users')
    .update({ has_completed_calibration: true })
    .eq('id', userId)

  if (error) {
    throw new Error(`Failed to skip calibration: ${error.message}`)
  }

  return { success: true }
}

async function applyOutfitFeedback(
  outfitId: string,
  liked: boolean,
  source: 'daily' | 'calibration',
  completeCalibration: boolean,
  idempotencyKey: string,
): Promise<{ vector: StyleVector; changedTags: string[]; nextOutfit?: CalibrationOutfit }> {
  const { supabase, userId } = await getAuthedUserId()
  if (!idempotencyKey || idempotencyKey.length > 200) throw new Error('Invalid idempotency key')
  const { data, error } = await supabase.rpc('submit_outfit_feedback', {
    p_outfit_id: outfitId,
    p_liked: liked,
    p_feedback_source: source,
    p_idempotency_key: idempotencyKey,
  })
  const result = Array.isArray(data) ? data[0] : data
  if (error || !result || !Array.isArray(result.changed_tags) || !result.vector) {
    throw new Error(`Failed to save feedback: ${error?.message ?? 'Invalid result'}`)
  }
  const nextVector = result.vector as StyleVector
  const changedTags = result.changed_tags as string[]

  if (source === 'daily') return { vector: nextVector, changedTags }

  const { data: outfitRow, error: outfitError } = await supabase
    .from('outfits')
    .select('item_ids, outfit_items(wardrobe_item_id)')
    .eq('id', outfitId)
    .single()

  const relationalItemIds = Array.isArray(outfitRow?.outfit_items)
    ? outfitRow.outfit_items.map((item: { wardrobe_item_id: string }) => item.wardrobe_item_id)
    : null
  const itemIds = relationalItemIds?.length ? relationalItemIds : outfitRow?.item_ids as string[] | null
  if (outfitError || !outfitRow || !Array.isArray(itemIds)) {
    throw new Error('Outfit not found')
  }

  let nextOutfit: CalibrationOutfit | undefined

  if (source === 'calibration' && !completeCalibration) {
    const excludeKeys = await getShownOutfitKeys(supabase, userId)
    const wardrobeItems = await fetchStyleSeedItems(supabase, userId)
    const candidates = recommendOutfits(wardrobeItems, nextVector, { topN: 8 })
    const picked = pickDiverseCalibrationCandidate(candidates, excludeKeys, itemIds)

    if (picked) {
      const savedOutfitId = await persistCalibrationOutfit(supabase, picked, buildReasons(picked, nextVector))
      if (savedOutfitId) {
        nextOutfit = {
          ...picked,
          id: savedOutfitId,
          vector: nextVector,
          reasons: buildReasons(picked, nextVector),
        }
      }
    }
  }

  if (completeCalibration) {
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({ has_completed_calibration: true })
      .eq('id', userId)

    if (userUpdateError) {
      throw new Error(`Failed to complete calibration: ${userUpdateError.message}`)
    }
  }

  return { vector: nextVector, changedTags, nextOutfit }
}
