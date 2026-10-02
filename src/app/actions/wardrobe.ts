'use server'

import { createClient } from '@/src/lib/supabase/server'
import { normalizeWardrobeItem } from '@/src/lib/wardrobe/normalize'
import { deletePrivateObject, signedOwnedPrivateUrl, uploadValidatedPrivateImage } from '@/src/lib/media/private-media'
import { randomUUID } from 'node:crypto'

// ---------------------------------------------------------------------------
// Public types — the only shape the frontend ever sees
// ---------------------------------------------------------------------------

export type CuratedItem = {
  id: string
  category: string
  image_url: string | null
  display_name: string
}

export type RankedPiecesResult = {
  items: CuratedItem[]
  hasMore: boolean
}

export type UserWardrobeItem = {
  id: string
  category: string | null
  subcategory: string | null
  brand: string | null
  display_name: string | null
  image_url: string | null
  color: unknown
  fit: unknown
  style_tags: unknown
  layer_role: string | null
  quantity: number
  added_at: string
  status: 'confirmed' | 'draft' | 'rejected'
}

export type WardrobeAttributeUpdates = {
  category?: string | null
  subcategory?: string | null
  brand?: string | null
  display_name?: string | null
  color?: unknown
  fit?: unknown
  style_tags?: unknown
}

async function getAuthenticatedClient() {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) throw new Error('Not authenticated')
  return { supabase, userId: data.user.id }
}

async function mapUserWardrobeRow(row: Record<string, unknown>, supabase: Awaited<ReturnType<typeof createClient>>): Promise<UserWardrobeItem | null> {
  const raw = Array.isArray(row.wardrobe_items) ? row.wardrobe_items[0] : row.wardrobe_items
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  return {
    id: String(item.id),
    category: (item.category as string | null) ?? null,
    subcategory: (item.subcategory as string | null) ?? null,
    brand: (item.brand as string | null) ?? null,
    display_name: (item.display_name as string | null) ?? null,
    image_url: item.media_asset_id
      ? await signedOwnedPrivateUrl(supabase, String(item.media_asset_id))
      : (item.image_url as string | null) ?? null,
    color: item.color ?? {},
    fit: item.fit ?? {},
    style_tags: item.style_tags ?? {},
    layer_role: (item.layer_role as string | null) ?? null,
    quantity: Number(row.quantity ?? 1),
    added_at: String(row.added_at ?? ''),
    status: (item.status as UserWardrobeItem['status']) ?? 'confirmed',
  }
}

export async function getUserWardrobeItems(category?: string, subcategory?: string) {
  const { supabase, userId } = await getAuthenticatedClient()
  let query = supabase.from('user_wardrobe_items')
    .select('item_id, quantity, added_at, wardrobe_items (id, category, subcategory, brand, display_name, image_url, media_asset_id, color, fit, style_tags, layer_role, status)')
    .eq('user_id', userId).eq('wardrobe_items.status', 'confirmed')
    .order('added_at', { ascending: false })
  if (category) query = query.eq('wardrobe_items.category', category)
  if (subcategory) query = query.eq('wardrobe_items.subcategory', subcategory)
  const { data, error } = await query
  if (error) throw new Error('Could not fetch wardrobe items')
  const mapped = await Promise.all(((data ?? []) as Record<string, unknown>[]).map((row) => mapUserWardrobeRow(row, supabase)))
  return mapped.filter((item): item is UserWardrobeItem => item !== null)
}

export async function getUserDraftItems() {
  const { supabase, userId } = await getAuthenticatedClient()
  const { data, error } = await supabase.from('user_wardrobe_items')
    .select('item_id, quantity, added_at, wardrobe_items (id, category, subcategory, brand, display_name, image_url, media_asset_id, source_photo_id, color, fit, style_tags, layer_role, status)')
    .eq('user_id', userId).eq('wardrobe_items.status', 'draft').order('added_at', { ascending: false })
  if (error) throw new Error('Could not fetch draft wardrobe items')
  const singlePieceRows = ((data ?? []) as Record<string, unknown>[]).filter((row) => {
    const item = Array.isArray(row.wardrobe_items) ? row.wardrobe_items[0] : row.wardrobe_items
    return !item || typeof item !== 'object' || !(item as Record<string, unknown>).source_photo_id
  })
  const mapped = await Promise.all(singlePieceRows.map((row) => mapUserWardrobeRow(row, supabase)))
  return mapped.filter((item): item is UserWardrobeItem => item !== null)
}

export async function confirmDraftItem(itemId: string) { return updateWardrobeStatus(itemId, 'confirmed') }
export async function discardDraftItem(itemId: string) { return updateWardrobeStatus(itemId, 'rejected') }

async function updateWardrobeStatus(itemId: string, status: 'confirmed' | 'rejected') {
  const { supabase } = await getAuthenticatedClient()
  if (status === 'confirmed') {
    const { data: item, error: lookupError } = await supabase.from('wardrobe_items')
      .select('source_photo_id').eq('id', itemId).single()
    if (lookupError || !item) throw new Error('Could not find draft wardrobe item')
    if (item.source_photo_id) {
      const { error } = await supabase.rpc('confirm_outfit_photo_draft', {
        p_item_id: itemId, p_use_reconstructed: false,
      })
      if (error) throw new Error('Could not confirm outfit draft')
      return { success: true }
    }
  }
  const { error } = await supabase.from('wardrobe_items').update({ status }).eq('id', itemId)
  if (error) throw new Error('Could not update wardrobe item')
  return { success: true }
}

export async function updateWardrobeItemAttributes(itemId: string, updates: WardrobeAttributeUpdates) {
  const { supabase } = await getAuthenticatedClient()
  const allowed = Object.fromEntries(Object.entries(updates).filter(([key]) =>
    ['category', 'subcategory', 'brand', 'display_name', 'color', 'fit', 'style_tags'].includes(key)))
  const classification = ('category' in allowed || 'subcategory' in allowed)
    ? normalizeWardrobeItem({ category: (allowed.category as string | null) ?? null, subcategory: (allowed.subcategory as string | null) ?? null })
    : null
  const { error } = await supabase.from('wardrobe_items').update({
    ...allowed,
    ...(classification ? { category: classification.category, layer_role: classification.layer_role } : {}),
  }).eq('id', itemId)
  if (error) throw new Error('Could not update wardrobe item')
  return { success: true }
}

export async function replaceWardrobeItemPhoto(itemId: string, imageFile: File) {
  const { supabase, userId } = await getAuthenticatedClient()
  const media = await uploadValidatedPrivateImage(supabase, userId, imageFile)
  const { data: asset, error: assetError } = await supabase.from('media_assets').insert({ owner_id: userId, bucket_id: media.bucket, object_path: media.path, kind: 'wardrobe_item', mime_type: media.mimeType, byte_size: media.byteSize, sha256: media.sha256, width: media.width, height: media.height }).select('id').single()
  if (assetError || !asset) { await deletePrivateObject(supabase, userId, media.path); throw new Error('Could not record private image') }
  const { error } = await supabase.rpc('attach_media_asset_to_wardrobe_item', { p_item_id: itemId, p_media_asset_id: asset.id })
  if (error) { await supabase.from('media_assets').delete().eq('id', asset.id); await deletePrivateObject(supabase, userId, media.path); throw new Error('Could not replace wardrobe image') }
  return { success: true }
}

export async function removeWardrobeItem(itemId: string) {
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('remove_user_wardrobe_item', { p_item_id: itemId })
  if (error) throw new Error('Could not remove wardrobe item')
  return { success: true }
}

export async function updateItemQuantity(itemId: string, quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Quantity must be at least 1')
  const { supabase, userId } = await getAuthenticatedClient()
  const { error } = await supabase.from('user_wardrobe_items').update({ quantity }).eq('user_id', userId).eq('item_id', itemId)
  if (error) throw new Error('Could not update item quantity')
  return { success: true }
}

export async function uploadDraftWardrobeItem(imageFile: File) {
  const { supabase, userId } = await getAuthenticatedClient()
  const media = await uploadValidatedPrivateImage(supabase, userId, imageFile)
  const { data: asset, error: assetError } = await supabase.from('media_assets').insert({ owner_id: userId, bucket_id: media.bucket, object_path: media.path, kind: 'wardrobe_item', mime_type: media.mimeType, byte_size: media.byteSize, sha256: media.sha256, width: media.width, height: media.height }).select('id').single()
  if (assetError || !asset) { await deletePrivateObject(supabase, userId, media.path); throw new Error('Could not record private image') }
  const { data: itemId, error: itemError } = await supabase.rpc('create_draft_wardrobe_item', {
    p_image_url: media.stableUrl,
  })
  if (itemError || !itemId) {
    await supabase.from('media_assets').delete().eq('id', asset.id); await deletePrivateObject(supabase, userId, media.path)
    throw new Error(itemError?.message || 'Could not create draft wardrobe item')
  }
  const { error: linkError } = await supabase.rpc('attach_media_asset_to_wardrobe_item', { p_item_id: itemId, p_media_asset_id: asset.id })
  if (linkError) {
    await supabase.rpc('remove_user_wardrobe_item', { p_item_id: itemId })
    await supabase.from('media_assets').delete().eq('id', asset.id)
    await deletePrivateObject(supabase, userId, media.path)
    throw new Error('Could not link private image to wardrobe item')
  }
  const { error: queueError } = await supabase.rpc('enqueue_wardrobe_extraction_job', { p_item_id: itemId })
  if (queueError) {
    await supabase.rpc('remove_user_wardrobe_item', { p_item_id: itemId })
    await supabase.from('media_assets').delete().eq('id', asset.id)
    await deletePrivateObject(supabase, userId, media.path)
    throw new Error('Could not queue wardrobe extraction')
  }
  return { success: true, itemId }
}

/** Queue one source photo for multi-garment review; no garment is auto-confirmed. */
export async function uploadOutfitPhoto(imageFile: File) {
  if (process.env.ENABLE_OUTFIT_PHOTO_UPLOAD !== 'true') throw new Error('Outfit photo upload is not enabled')
  const { supabase, userId } = await getAuthenticatedClient()
  const media = await uploadValidatedPrivateImage(supabase, userId, imageFile)
  const { data: asset, error: assetError } = await supabase.from('media_assets').insert({
    owner_id: userId, bucket_id: media.bucket, object_path: media.path,
    kind: 'source_photo', mime_type: media.mimeType, byte_size: media.byteSize,
    sha256: media.sha256, width: media.width, height: media.height,
  }).select('id').single()
  if (assetError || !asset) {
    await deletePrivateObject(supabase, userId, media.path)
    throw new Error('Could not record outfit photo')
  }
  const { data: photo, error: photoError } = await supabase.from('source_photos').insert({
    user_id: userId, image_url: media.stableUrl, media_asset_id: asset.id,
    status: 'uploading', idempotency_key: randomUUID(), file_hash: media.sha256,
  }).select('id').single()
  if (photoError || !photo) {
    await supabase.from('media_assets').delete().eq('id', asset.id)
    await deletePrivateObject(supabase, userId, media.path)
    throw new Error('Could not record outfit source photo')
  }
  const { data: jobId, error: queueError } = await supabase.rpc('enqueue_outfit_photo_job', {
    p_source_photo_id: photo.id,
  })
  if (queueError || !jobId) {
    await supabase.from('source_photos').delete().eq('id', photo.id)
    await supabase.from('media_assets').delete().eq('id', asset.id)
    await deletePrivateObject(supabase, userId, media.path)
    throw new Error('Could not queue outfit processing')
  }
  return { sourcePhotoId: String(photo.id), jobId: String(jobId) }
}

export type OutfitPhotoReview = {
  sourcePhotoId: string
  sourceImageUrl: string
  startedAt: string
  status: 'uploading' | 'detecting' | 'done' | 'failed'
  detectedCount: number
  jobStatus: string | null
  garments: Array<{
    id: string; category: string | null; subcategory: string | null
    displayName: string; brand: string | null; color: string
    originalImageUrl: string; reconstructedImageUrl: string | null
  }>
}

export async function getOutfitPhotoReview(sourcePhotoId: string): Promise<OutfitPhotoReview> {
  const { supabase, userId } = await getAuthenticatedClient()
  const { data: photo, error: photoError } = await supabase.from('source_photos')
    .select('id, media_asset_id, status, detected_count, created_at').eq('id', sourcePhotoId).eq('user_id', userId).single()
  if (photoError || !photo?.media_asset_id) throw new Error('Outfit photo not found')
  const { data: job } = await supabase.from('ai_jobs').select('status')
    .eq('source_photo_id', sourcePhotoId).eq('user_id', userId)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  const { data: rows, error: itemError } = await supabase.from('wardrobe_items')
    .select('id, category, subcategory, display_name, brand, color, status, original_media_asset_id, reconstructed_media_asset_id')
    .eq('source_photo_id', sourcePhotoId).eq('status', 'draft').order('created_at')
  if (itemError) throw new Error('Could not load extracted garments')
  const garments = await Promise.all((rows ?? []).map(async (item) => ({
    id: String(item.id), category: item.category, subcategory: item.subcategory,
    displayName: item.display_name || 'Garment', brand: item.brand,
    color: typeof item.color?.primary === 'string' ? item.color.primary : 'Unknown',
    originalImageUrl: await signedOwnedPrivateUrl(supabase, String(item.original_media_asset_id)),
    reconstructedImageUrl: item.reconstructed_media_asset_id
      ? await signedOwnedPrivateUrl(supabase, String(item.reconstructed_media_asset_id)) : null,
  })))
  return {
    sourcePhotoId, sourceImageUrl: await signedOwnedPrivateUrl(supabase, String(photo.media_asset_id)),
    startedAt: String(photo.created_at),
    status: photo.status as OutfitPhotoReview['status'], detectedCount: Number(photo.detected_count ?? 0),
    jobStatus: job?.status ?? null, garments,
  }
}

export async function getOutfitPhotoSessions() {
  if (process.env.ENABLE_OUTFIT_PHOTO_UPLOAD !== 'true') return []
  const { supabase, userId } = await getAuthenticatedClient()
  const { data, error } = await supabase.from('source_photos')
    .select('id, status, created_at, media_asset_id').eq('user_id', userId)
    .not('media_asset_id', 'is', null).order('created_at', { ascending: false }).limit(12)
  if (error) throw new Error('Could not load outfit photos')
  return (data ?? []).map((photo) => ({
    id: String(photo.id), status: String(photo.status), createdAt: String(photo.created_at),
  }))
}

export async function confirmOutfitPhotoDraft(itemId: string, useReconstructed: boolean) {
  const { supabase } = await getAuthenticatedClient()
  const { error } = await supabase.rpc('confirm_outfit_photo_draft', {
    p_item_id: itemId, p_use_reconstructed: useReconstructed,
  })
  if (error) throw new Error('Could not add extracted garment')
  return { success: true }
}

// ---------------------------------------------------------------------------
// Internal constants
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = ['top', 'bottom', 'footwear', 'outerwear', 'accessory'] as const

/** Relative threshold — include items scoring ≥ this fraction of the top score. */
const THRESHOLD_RATIO = 0.70

/** UX guardrails for items per batch. */
const BATCH_FLOOR = 4
const BATCH_CEILING = 14

/** Maximum number of pagination batches per category. */
const MAX_BATCHES = 3

// ---------------------------------------------------------------------------
// Category mapping — single source of truth
// ---------------------------------------------------------------------------

function mapWardrobeCategory(item: {
  category: string | null
  subcategory?: string | null
  display_name?: string | null
  layer_role?: string | null
}) {
  return normalizeWardrobeItem(item).category
}

// ---------------------------------------------------------------------------
// Scoring helper
// ---------------------------------------------------------------------------

function scoreItem(
  styleTags: Record<string, number>,
  userVector: Record<string, number>,
): number {
  let score = 0
  for (const tag in userVector) {
    if (styleTags[tag]) {
      score += userVector[tag] * styleTags[tag]
    }
  }
  return score
}

// ---------------------------------------------------------------------------
// getRankedPieces — threshold-ranked, paginated, single-category
// ---------------------------------------------------------------------------

/**
 * Returns threshold-ranked items for a single category.
 *
 * Scoring: dot product of item.style_tags against fashion_dna.vector.
 * Inclusion: any item scoring ≥ 70% of that category's top score.
 * Clamped to [BATCH_FLOOR, BATCH_CEILING] per batch as a UX guardrail.
 *
 * Pagination: batch 0 = threshold items, batch 1-2 = next-best items
 * below the threshold. Max 3 total batches per category.
 *
 * @param category  One of the mapped category keys (top, bottom, etc.)
 * @param batch     Pagination batch index (0, 1, or 2). Default 0.
 */
export async function getRankedPieces(
  category: string,
  batch = 0,
   excludeIds: string[] = [],
): Promise<RankedPiecesResult> {
  if (batch < 0 || batch >= MAX_BATCHES) {
    return { items: [], hasMore: false }
  }

  const supabase = await createClient()

  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    throw new Error('Not authenticated')
  }

  // 1. Fetch fashion DNA
  const { data: dna, error: dnaError } = await supabase
    .from('fashion_dna')
    .select('vector')
    .eq('user_id', userData.user.id)
    .single()

  if (dnaError || !dna) {
    throw new Error('Fashion DNA not found')
  }

  const userVector = dna.vector as Record<string, number>

  // 2. Prefer the database category filter, with a legacy fallback query.
  const [primaryResult, legacyResult] = await Promise.all([
    supabase.from('wardrobe_items').select('id, category, subcategory, image_url, display_name, layer_role, style_tags').eq('source', 'curated').eq('category', category),
    supabase.from('wardrobe_items').select('id, category, subcategory, image_url, display_name, layer_role, style_tags').eq('source', 'curated').or('category.is.null,category.eq.'),
  ])
  const itemsError = primaryResult.error ?? legacyResult.error
  const items = [...(primaryResult.data ?? []), ...(legacyResult.data ?? [])]
  if (itemsError) throw new Error('Could not fetch wardrobe items')

  // 3. Filter to requested category and score; dedupe by stable item id in a single pass.
  const seenIds = new Set<string>()
  const excludeSet = excludeIds.length > 0 ? new Set(excludeIds) : null
  const categoryItems: Array<{ id: string; image_url: string | null; display_name: string; score: number }> = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (excludeSet && excludeSet.has(item.id)) continue
    if (seenIds.has(item.id)) continue
    if (mapWardrobeCategory(item) !== category) continue

    seenIds.add(item.id)
    categoryItems.push({
      id: item.id,
      image_url: item.image_url,
      display_name: item.display_name,
      score: scoreItem(item.style_tags as Record<string, number>, userVector),
    })
  }

  categoryItems.sort((a, b) => b.score - a.score)

  if (categoryItems.length === 0) {
    return { items: [], hasMore: false }
  }

  // 4. Compute threshold
  const topScore = categoryItems[0].score
  const threshold = topScore * THRESHOLD_RATIO

  // 5. Split into threshold items and below-threshold items
  const aboveThreshold: typeof categoryItems = []
  const belowThreshold: typeof categoryItems = []
  for (let i = 0; i < categoryItems.length; i++) {
    const item = categoryItems[i]
    if (item.score >= threshold) {
      aboveThreshold.push(item)
    } else {
      belowThreshold.push(item)
    }
  }

  // 6. Build batches
  //    Batch 0: threshold items (clamped to [BATCH_FLOOR, BATCH_CEILING])
  //    Batch 1+: below-threshold items split into equal-ish chunks
  if (batch === 0) {
    // Clamp batch 0 to guardrails
    const clamped = aboveThreshold.slice(0, BATCH_CEILING)
    // If threshold produced fewer than floor, pad from below-threshold
    while (clamped.length < BATCH_FLOOR && belowThreshold.length > 0) {
      clamped.push(belowThreshold.shift()!)
    }

    const remainingBelowCount = belowThreshold.length
    return {
      items: clamped.map((item) => ({
        id: item.id,
        category,
        image_url: item.image_url,
        display_name: item.display_name,
      })),
      hasMore: remainingBelowCount > 0,
    }
  }

  // For batch 1 and 2, split below-threshold items evenly
  const chunkSize = Math.ceil(belowThreshold.length / (MAX_BATCHES - 1))
  const batchStart = (batch - 1) * chunkSize
  const batchEnd = Math.min(batchStart + chunkSize, belowThreshold.length)

  if (batchStart >= belowThreshold.length) {
    return { items: [], hasMore: false }
  }

  const batchItems = belowThreshold.slice(batchStart, batchEnd)
  const hasMore = batchEnd < belowThreshold.length

  return {
    items: batchItems.map((item) => ({
      id: item.id,
      category,
      image_url: item.image_url,
      display_name: item.display_name,
    })),
    hasMore,
  }
}

// ---------------------------------------------------------------------------
// searchPieces — category-scoped text search
// ---------------------------------------------------------------------------

/**
 * Search for items by display_name or subcategory within a single
 * mapped category. Case-insensitive ILIKE matching pushed down to SQL.
 *
 * Returns the same CuratedItem shape — never exposes scores or
 * internal fields.
 */
export async function searchPieces(
  category: string,
  query: string,
): Promise<CuratedItem[]> {
  if (!query || query.trim().length === 0) {
    return []
  }

  const supabase = await createClient()

  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    throw new Error('Not authenticated')
  }

  const cleanQuery = query.trim()
  const lowerQuery = cleanQuery.toLowerCase()

  // Use database-side filtering with ILIKE and limit to avoid fetching the entire database
  const { data: items, error: itemsError } = await supabase
    .from('wardrobe_items')
    .select('id, category, subcategory, image_url, display_name, layer_role')
    .eq('source', 'curated')
    .or(`display_name.ilike.%${cleanQuery}%,subcategory.ilike.%${cleanQuery}%`)

  if (itemsError || !items) {
    throw new Error('Could not fetch wardrobe items')
  }

  const seenIds = new Set<string>()
  const results: CuratedItem[] = []

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (seenIds.has(item.id)) continue
    if (mapWardrobeCategory(item) !== category) continue

    const nameMatch = item.display_name?.toLowerCase().includes(lowerQuery)
    const subMatch = item.subcategory?.toLowerCase().includes(lowerQuery)
    if (!nameMatch && !subMatch) continue

    seenIds.add(item.id)
    results.push({
      id: item.id,
      category,
      image_url: item.image_url,
      display_name: item.display_name,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// saveWardrobeSelection — unchanged, single atomic write
// ---------------------------------------------------------------------------

export type OrphanedWardrobeItemsReport = {
  total: number
  byUser: Record<string, number>
}

export async function findOrphanedWardrobeItems(): Promise<OrphanedWardrobeItemsReport> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('wardrobe_items').select('id, layer_role, user_wardrobe_items(user_id)')
  if (error || !data) throw new Error('Could not inspect wardrobe items')
  const validRoles = new Set(['base_layer', 'bottom', 'footwear', 'outerwear', 'accessory'])
  const byUser: Record<string, number> = {}
  let total = 0
  for (const row of data as Array<{ layer_role: string | null; user_wardrobe_items: Array<{ user_id: string }> | null }>) {
    if (row.layer_role && validRoles.has(row.layer_role)) continue
    total += 1
    for (const link of row.user_wardrobe_items ?? []) byUser[link.user_id] = (byUser[link.user_id] ?? 0) + 1
  }
  return { total, byUser }
}

export async function saveWardrobeSelection(itemIds: string[]) {
  const supabase = await createClient()

  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    throw new Error('Not authenticated')
  }

  const userId = userData.user.id

  const inserts = itemIds.map((itemId) => ({
    user_id: userId,
    item_id: itemId,
  }))

  const { error } = await supabase
    .from('user_wardrobe_items')
    .upsert(inserts, { onConflict: 'user_id, item_id' })

  if (error) {
    throw new Error('Failed to save wardrobe selection')
  }

  return { success: true }
}

// ---------------------------------------------------------------------------
// getCuratedPieces — kept for backward compatibility
// ---------------------------------------------------------------------------

export async function getCuratedPieces(): Promise<Record<string, CuratedItem[]>> {
  const supabase = await createClient()

  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    throw new Error('Not authenticated')
  }

  const { data: dna, error: dnaError } = await supabase
    .from('fashion_dna')
    .select('vector')
    .eq('user_id', userData.user.id)
    .single()

  if (dnaError || !dna) {
    throw new Error('Fashion DNA not found')
  }

  const userVector = dna.vector as Record<string, number>

  const { data: items, error: itemsError } = await supabase
    .from('wardrobe_items')
    .select('id, category, subcategory, image_url, display_name, layer_role, style_tags')
    .eq('source', 'curated')

  if (itemsError || !items) {
    throw new Error('Could not fetch wardrobe items')
  }

  const scoredItems = items.map((item) => ({
    id: item.id,
    category: item.category,
    subcategory: item.subcategory,
    image_url: item.image_url,
    display_name: item.display_name,
    layer_role: item.layer_role,
    score: scoreItem(item.style_tags as Record<string, number>, userVector),
  }))

  const grouped: Record<string, CuratedItem[]> = Object.fromEntries(
    CATEGORY_ORDER.map((category) => [category, []]),
  )

  scoredItems.sort((a, b) => b.score - a.score)

  for (const item of scoredItems) {
    const mappedCat = mapWardrobeCategory(item)

    if (!grouped[mappedCat]) {
      grouped[mappedCat] = []
    }

    if (grouped[mappedCat].length < 10) {
      grouped[mappedCat].push({
        id: item.id,
        category: mappedCat,
        image_url: item.image_url,
        display_name: item.display_name,
      })
    }
  }

  return grouped
}
