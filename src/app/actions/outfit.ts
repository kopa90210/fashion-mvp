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
import { getChangedTags } from '@/src/lib/outfit/feedback-helpers'

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
  category: string | null
  subcategory: string | null
  layer_role: string | null
  style_tags: Partial<StyleVector> | null
}

type UserWardrobeJoinRow = {
  wardrobe_items: WardrobeJoinItem | WardrobeJoinItem[] | null
}

type StoredDailyOutfitRow = {
  id: string
  item_ids: string[] | null
  reasoning: string[] | null
}

function clampStyleWeight(value: number) {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100))
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
  if (!Array.isArray(stored.item_ids)) return null

  const itemsById = new Map(items.map((item) => [item.id, item]))
  const resolvedItems = stored.item_ids.map((id) => itemsById.get(id))

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
  startOfDay: Date,
) {
  const { data } = await supabase
    .from('outfits')
    .select('id, item_ids, reasoning')
    .eq('user_id', userId)
    .in('source', ['daily_ai', 'daily_fallback'])
    .gte('created_at', startOfDay.toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!data) {
    return null
  }

  return resolveStoredDailyOutfit(data as StoredDailyOutfitRow, items, dna)
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
async function fetchWardrobeItems(
  supabase: SupabaseClient,
  userId: string,
): Promise<WardrobeItem[]> {
  const { data: rows, error: itemsError } = await supabase
    .from('user_wardrobe_items')
    .select(
      `
      wardrobe_items (
        id,
        display_name,
        image_url,
        category,
        subcategory,
        layer_role,
        style_tags
      )
      `,
    )
    .eq('user_id', userId)

  if (itemsError || !rows) {
    console.error('outfit action - wardrobe fetch error:', itemsError)
    throw new Error('Could not fetch wardrobe items')
  }

  const normalizedRows = (rows as UserWardrobeJoinRow[])
    .map((row) => Array.isArray(row.wardrobe_items) ? row.wardrobe_items[0] : row.wardrobe_items)
    .filter((item): item is NonNullable<typeof item> => item !== null)

  let excludedCount = 0
  const items = normalizedRows.map((item) => {
    const normalized = normalizeWardrobeItem(item)
    if (!normalized.layer_role) excludedCount += 1
    return {
      id: item.id,
      display_name: item.display_name,
      image_url: item.image_url ?? null,
      layer_role: normalized.layer_role as LayerRole,
      style_tags: (item.style_tags as Partial<StyleVector>) ?? {},
    }
  })
  if (excludedCount > 0) console.warn('outfit action - excluded wardrobe items with unmapped layer_role:', excludedCount)
  return items
}

async function getUserDnaAndWardrobeInternal(
  supabase: SupabaseClient,
  userId: string,
) {
  const [dnaResult, items] = await Promise.all([
    supabase
      .from('fashion_dna')
      .select('vector')
      .eq('user_id', userId)
      .single(),
    fetchWardrobeItems(supabase, userId),
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

async function getUserDnaAndWardrobe() {
  const { supabase, userId } = await getAuthedUserId()
  return getUserDnaAndWardrobeInternal(supabase, userId)
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

  const { dna, items } = await getUserDnaAndWardrobeInternal(supabase, userId)
  return recommendOutfits(items, dna, { topN: 3 }).length >= 1
}

export async function getCalibrationOutfits(): Promise<CalibrationOutfit[]> {
  const { supabase, userId, dna, items } = await getUserDnaAndWardrobe()

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
    const { data: saved, error: outfitError } = await supabase
      .from('outfits')
      .insert({ user_id: userId, item_ids: candidate.items.map((item) => item.id) })
      .select('id')
      .single()

    if (outfitError || !saved) {
      throw new Error(`Failed to save calibration outfit: ${outfitError?.message ?? 'unknown error'}`)
    }

    savedOutfits.push({
      ...candidate,
      id: saved.id,
      vector: dna,
      reasons: buildReasons(candidate, dna),
    })
  }

  return savedOutfits
}

export async function getDailyOutfit(): Promise<DailyOutfit | null> {
  const t0 = performance.now()
  const { supabase, userId, dna, items } = await getUserDnaAndWardrobe()
  const tData = performance.now() - t0

  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)

  if (process.env.ENABLE_AI_DAILY_OUTFITS === 'true') {
    const storedOutfit = await getStoredDailyOutfit(supabase, userId, items, dna, startOfDay)
    if (storedOutfit) {
      if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_PERF === 'true') {
        console.log(`[outfit] total=${Math.round(performance.now() - t0)}ms data=${Math.round(tData)}ms hit=stored_daily`)
      }
      return storedOutfit
    }
  }

  const excludeKeys = await getShownOutfitKeys(supabase, userId, startOfDay)

  const tEngine0 = performance.now()
  const candidates = recommendOutfits(items, dna, { topN: 10 })
  const tEngine = performance.now() - tEngine0

  const outfit =
    candidates.find((candidate) => !excludeKeys.has(outfitKey(candidate.items))) ??
    candidates[0]
  if (!outfit) {
    return null
  }

  const tInsert0 = performance.now()
  const itemIds = outfit.items.map((item) => item.id)
  const { data: savedOutfit, error: outfitError } = await supabase
    .from('outfits')
    .insert({
      user_id: userId,
      item_ids: itemIds,
    })
    .select('id')
    .single()

  if (outfitError || !savedOutfit) {
    throw new Error(`Failed to save daily outfit: ${outfitError?.message ?? 'unknown error'}`)
  }
  const tInsert = performance.now() - tInsert0

  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_PERF === 'true') {
    console.log(
      `[outfit] total=${Math.round(performance.now() - t0)}ms data=${Math.round(tData)}ms engine=${tEngine.toFixed(2)}ms persistence=${Math.round(tInsert)}ms candidates=${candidates.length}`,
    )
  }

  return {
    ...outfit,
    id: savedOutfit.id,
    vector: dna,
    reasons: buildReasons(outfit, dna),
  }
}

export async function submitOutfitFeedback(
  outfitId: string,
  liked: boolean,
): Promise<{ vector: StyleVector; changedTags: string[] }> {
  const result = await applyOutfitFeedback(outfitId, liked, 'daily', false)
  return { vector: result.vector, changedTags: result.changedTags }
}

export async function submitCalibrationFeedback(
  outfitId: string,
  liked: boolean,
  isFinalOutfit: boolean = false,
): Promise<{ vector: StyleVector; changedTags: string[]; nextOutfit?: CalibrationOutfit }> {
  return applyOutfitFeedback(outfitId, liked, 'calibration', isFinalOutfit)
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
): Promise<{ vector: StyleVector; changedTags: string[]; nextOutfit?: CalibrationOutfit }> {
  const { supabase, userId } = await getAuthedUserId()

  const { error: feedbackError } = await supabase.from('feedback').insert({
    user_id: userId,
    outfit_id: outfitId,
    liked,
    source,
  })

  if (feedbackError) {
    throw new Error(`Failed to save feedback: ${feedbackError.message}`)
  }

  const { data: outfitRow, error: outfitError } = await supabase
    .from('outfits')
    .select('item_ids')
    .eq('id', outfitId)
    .single()

  if (outfitError || !outfitRow || !outfitRow.item_ids) {
    throw new Error('Outfit not found')
  }

  const itemIds = outfitRow.item_ids as string[]
  const { data: items, error: itemsError } = await supabase
    .from('wardrobe_items')
    .select('style_tags')
    .in('id', itemIds)

  if (itemsError || !items) {
    throw new Error('Could not fetch wardrobe items for outfit')
  }

  const { data: dnaRow, error: dnaError } = await supabase
    .from('fashion_dna')
    .select('vector')
    .eq('user_id', userId)
    .single()

  if (dnaError || !dnaRow) {
    throw new Error('Fashion DNA not found')
  }

  const delta = liked ? 0.05 : -0.05
  const currentVector = (dnaRow.vector ?? {}) as StyleVector
  const changedTags = getChangedTags({ items: items as Array<{ style_tags: Record<string, number> }> })

  const nextVector: StyleVector = { ...currentVector }
  for (const tag of changedTags) {
    nextVector[tag] = clampStyleWeight((nextVector[tag] ?? 0) + delta)
  }

  const { error: updateError } = await supabase
    .from('fashion_dna')
    .update({
      vector: nextVector,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)

  if (updateError) {
    throw new Error(`Failed to update fashion DNA: ${updateError.message}`)
  }

  let nextOutfit: CalibrationOutfit | undefined

  if (source === 'calibration' && !completeCalibration) {
    const excludeKeys = await getShownOutfitKeys(supabase, userId)
    const wardrobeItems = await fetchWardrobeItems(supabase, userId)
    const candidates = recommendOutfits(wardrobeItems, nextVector, { topN: 8 })
    const picked = pickDiverseCalibrationCandidate(candidates, excludeKeys, itemIds)

    if (picked) {
      const { data: saved } = await supabase
        .from('outfits')
        .insert({ user_id: userId, item_ids: picked.items.map((item) => item.id) })
        .select('id')
        .single()

      if (saved) {
        nextOutfit = {
          ...picked,
          id: saved.id,
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

