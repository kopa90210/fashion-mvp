'use server'

import { createClient } from '@/src/lib/supabase/server'
import { isValidOutfitStructure, scoreOutfit, type LayerRole, type WardrobeItem } from '@/src/lib/outfit/engine'
import type { StyleVector } from '@/src/lib/quiz/scoring'
import { normalizeWardrobeItem } from '@/src/lib/wardrobe/normalize'
import { signedOwnedPrivateUrl } from '@/src/lib/media/private-media'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_SWAP_CANDIDATES = 20

type WardrobeRow = {
  id: string
  display_name: string | null
  image_url: string | null
  media_asset_id: string | null
  status: string
  category: string | null
  subcategory: string | null
  layer_role: string | null
  style_tags: Partial<StyleVector> | null
}

type OwnershipRow = {
  user_id: string
  retired_at: string | null
  wardrobe_items: WardrobeRow | WardrobeRow[] | null
}

type OutfitMembershipRow = {
  wardrobe_item_id: string
  slot: LayerRole
  position: number
}

type OutfitRow = {
  id: string
  outfit_items: OutfitMembershipRow[] | null
}

export type SwapCandidate = {
  replacement: WardrobeItem
  category: string
  subcategory: string | null
  descriptor: string
  outfitScore: number
}

const CATEGORY_NAMES: Record<string, string> = {
  top: 'Top', bottom: 'Bottom', one_piece: 'One-piece', footwear: 'Shoes', outerwear: 'Layer', accessory: 'Accessory',
}

function humanize(value: string) {
  return value.trim().replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function singleRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value
}

function toEngineItem(row: WardrobeRow): WardrobeItem {
  const classification = normalizeWardrobeItem(row)
  return {
    id: row.id,
    display_name: row.display_name?.trim() || 'Wardrobe piece',
    image_url: row.image_url,
    layer_role: classification.layer_role,
    style_tags: row.style_tags && typeof row.style_tags === 'object' ? row.style_tags : {},
  }
}

function assertUuid(value: string, label: string) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) throw new Error(`Invalid ${label}`)
}

export async function getSwapCandidates(outfitId: string, itemId: string, limit = 3): Promise<SwapCandidate[]> {
  assertUuid(outfitId, 'outfit')
  assertUuid(itemId, 'item')
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SWAP_CANDIDATES) throw new Error('Invalid candidate limit')

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) throw new Error('Not authenticated')
  const userId = authData.user.id

  const [outfitResult, dnaResult, wardrobeResult] = await Promise.all([
    supabase.from('outfits')
      .select('id, outfit_items(wardrobe_item_id, slot, position)')
      .eq('id', outfitId).eq('user_id', userId).single(),
    supabase.from('fashion_dna').select('vector').eq('user_id', userId).single(),
    supabase.from('user_wardrobe_items')
      .select('user_id, retired_at, wardrobe_items(id, display_name, image_url, media_asset_id, status, category, subcategory, layer_role, style_tags)')
      .eq('user_id', userId).is('retired_at', null),
  ])

  if (outfitResult.error || !outfitResult.data) throw new Error('Outfit not found')
  if (dnaResult.error || !dnaResult.data?.vector) throw new Error('Fashion DNA not found')
  if (wardrobeResult.error || !wardrobeResult.data) throw new Error('Could not load wardrobe')

  const eligibleRows = (wardrobeResult.data as OwnershipRow[])
    .filter((row) => row.user_id === userId && row.retired_at === null)
    .map((row) => singleRelation(row.wardrobe_items))
    .filter((row): row is WardrobeRow => row !== null && row.status === 'confirmed')
  const wardrobeRowsById = new Map(eligibleRows.map((row) => [row.id, row]))
  const ownedItems = eligibleRows.map(toEngineItem)
  const ownedById = new Map(ownedItems.map((item) => [item.id, item]))

  const memberships = [...(((outfitResult.data as OutfitRow).outfit_items) ?? [])]
    .sort((a, b) => a.position - b.position)
  const selectedMembership = memberships.find((membership) => membership.wardrobe_item_id === itemId)
  if (!selectedMembership) throw new Error('Item is not part of outfit')

  const parentItems = memberships.map((membership) => ownedById.get(membership.wardrobe_item_id))
  if (parentItems.some((item) => !item)) throw new Error('Outfit contains unavailable wardrobe items')
  const currentItems = parentItems as WardrobeItem[]
  const selectedItem = ownedById.get(itemId)
  if (!selectedItem || selectedItem.layer_role !== selectedMembership.slot) throw new Error('Outfit item has an invalid role')
  if (!isValidOutfitStructure(currentItems)) throw new Error('Outfit is structurally invalid')

  const currentIds = new Set(currentItems.map((item) => item.id))
  const dna = dnaResult.data.vector as StyleVector
  const candidates = ownedItems
    .filter((candidate) => candidate.layer_role === selectedMembership.slot && !currentIds.has(candidate.id))
    .map((replacement) => {
      const resultingItems = currentItems.map((item) => item.id === itemId ? replacement : item)
      return { replacement, resultingItems, outfitScore: scoreOutfit(resultingItems, dna) }
    })
    .filter((candidate) => isValidOutfitStructure(candidate.resultingItems))
    .sort((a, b) => b.outfitScore - a.outfitScore
      || (a.replacement.id < b.replacement.id ? -1 : a.replacement.id > b.replacement.id ? 1 : 0))
    .slice(0, limit)

  return Promise.all(candidates.map(async ({ replacement, outfitScore }) => {
    const row = wardrobeRowsById.get(replacement.id)!
    const category = normalizeWardrobeItem(row).category
    const subcategory = row.subcategory?.trim() || null
    return {
      replacement: {
        ...replacement,
        image_url: row.media_asset_id
          ? await signedOwnedPrivateUrl(supabase, row.media_asset_id)
          : replacement.image_url,
      },
      category,
      subcategory,
      descriptor: subcategory ? `${humanize(subcategory)} · ${CATEGORY_NAMES[category]}` : CATEGORY_NAMES[category],
      outfitScore,
    }
  }))
}

export async function createSwappedOutfit(parentOutfitId: string, replacedItemId: string, replacementItemId: string, idempotencyKey: string) {
  assertUuid(parentOutfitId, 'outfit')
  assertUuid(replacedItemId, 'replaced item')
  assertUuid(replacementItemId, 'replacement item')
  if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim() || [...idempotencyKey].length > 200) throw new Error('Invalid idempotency key')

  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) throw new Error('Not authenticated')
  const { data, error } = await supabase.rpc('create_swapped_outfit', {
    p_parent_outfit_id: parentOutfitId,
    p_replaced_item_id: replacedItemId,
    p_replacement_item_id: replacementItemId,
    p_idempotency_key: idempotencyKey,
  })
  if (error || typeof data !== 'string') throw new Error('Could not create swapped outfit')
  return { outfitId: data }
}
