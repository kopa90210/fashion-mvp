import type { LayerRole, WardrobeItem } from '@/src/lib/outfit/engine'

export type CompositionFamily = `separates_${2 | 3 | 4 | 5}` | `onepiece_${2 | 3 | 4 | 5}`

export type LayoutBox = {
  itemId: string
  role: LayerRole
  slot: string
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export type ComposeOutfitOptions = {
  calibration?: boolean
}

type Anchor = { x: number; y: number }
type BoxSize = { width: number; height: number }

const SAFE = { left: 4, right: 96, top: 4, bottom: 94 }
const MIN_GAP = 2.25

const importance: Record<LayerRole, number> = {
  one_piece: 0,
  base_layer: 1,
  bottom: 2,
  outerwear: 3,
  footwear: 4,
  accessory: 5,
}

const roleAspect: Record<LayerRole, number> = {
  one_piece: 4 / 5,
  outerwear: 4 / 5,
  base_layer: 4 / 5,
  bottom: 3 / 5,
  footwear: 3 / 2,
  accessory: 1,
}

const mobileWidths: Record<LayerRole, number> = {
  one_piece: 38,
  outerwear: 30,
  base_layer: 29,
  bottom: 24,
  footwear: 31,
  accessory: 17,
}

const calibrationWidths: Record<LayerRole, number> = {
  one_piece: 48,
  outerwear: 36,
  base_layer: 34,
  bottom: 29,
  footwear: 24,
  accessory: 17,
}

const anchors = {
  upperLeft: { x: 29, y: 28 }, upperCenter: { x: 50, y: 28 }, upperRight: { x: 75, y: 28 },
  midLeft: { x: 30, y: 52 }, midCenter: { x: 50, y: 52 }, midRight: { x: 74, y: 51 },
  lowerLeft: { x: 30, y: 75 }, lowerCenter: { x: 50, y: 75 }, lowerRight: { x: 70, y: 75 },
} satisfies Record<string, Anchor>

export type AccessoryPlacementKind = 'waist' | 'carried' | 'accent'

export function classifyAccessory(item: WardrobeItem): AccessoryPlacementKind {
  const anyItem = item as { category?: string | null; subcategory?: string | null }
  const subcategory = (anyItem.subcategory ?? '').toLowerCase()
  if (subcategory.includes('belt') || subcategory.includes('waist') || subcategory.includes('sash')) {
    return 'waist'
  }
  if (subcategory.includes('bag') || subcategory.includes('tote') || subcategory.includes('backpack') || subcategory.includes('purse') || subcategory.includes('clutch')) {
    return 'carried'
  }
  if (
    subcategory.includes('hat') || subcategory.includes('cap') || subcategory.includes('beanie') ||
    subcategory.includes('glasses') || subcategory.includes('sunglasses') || subcategory.includes('eyewear') ||
    subcategory.includes('jewelry') || subcategory.includes('watch') || subcategory.includes('scarf')
  ) {
    return 'accent'
  }

  const name = (item.display_name ?? '').toLowerCase()
  if (name.includes('belt') || name.includes('sash')) {
    return 'waist'
  }
  if (name.includes('bag') || name.includes('tote') || name.includes('backpack') || name.includes('purse') || name.includes('clutch')) {
    return 'carried'
  }
  return 'accent'
}

function makeBox(
  item: WardrobeItem,
  slot: string,
  region: { x: number; y: number; width: number; height: number },
  zIndex: number
): LayoutBox {
  return {
    itemId: item.id,
    role: item.layer_role,
    slot,
    x: region.x,
    y: region.y,
    width: region.width,
    height: region.height,
    zIndex,
  }
}

function familyFor(items: WardrobeItem[]): CompositionFamily {
  const kind = items.some((item) => item.layer_role === 'one_piece') ? 'onepiece' : 'separates'
  const count = Math.min(5, Math.max(2, items.length)) as 2 | 3 | 4 | 5
  return `${kind}_${count}`
}

function sortAccessories(accessories: WardrobeItem[]): WardrobeItem[] {
  return [...accessories].sort((a, b) => {
    const kindOrder: Record<AccessoryPlacementKind, number> = { waist: 1, carried: 2, accent: 3 }
    const orderDiff = kindOrder[classifyAccessory(a)] - kindOrder[classifyAccessory(b)]
    if (orderDiff !== 0) return orderDiff
    return a.id.localeCompare(b.id)
  })
}

// ---------------------------------------------------------------------------
// Calibration Editorial Templates
// ---------------------------------------------------------------------------

function composeSeparatesWithOuterwear(items: WardrobeItem[]): LayoutBox[] {
  const top = items.find((i) => i.layer_role === 'base_layer')!
  const bottom = items.find((i) => i.layer_role === 'bottom')!
  const footwear = items.find((i) => i.layer_role === 'footwear')!
  const outerwear = items.find((i) => i.layer_role === 'outerwear')!
  const accessories = sortAccessories(items.filter((i) => i.layer_role === 'accessory'))

  const boxes: LayoutBox[] = [
    // Left column: Top -> Bottom -> Footwear
    makeBox(top, 'top', { x: 6, y: 4, width: 40, height: 30 }, 10),
    makeBox(bottom, 'bottom', { x: 6, y: 36, width: 40, height: 34 }, 8),
    makeBox(footwear, 'footwear', { x: 6, y: 72, width: 40, height: 20 }, 7),

    // Right column: Outerwear
    makeBox(outerwear, 'outerwear', { x: 52, y: 4, width: 42, height: 34 }, 9),
  ]

  if (accessories.length === 1) {
    const acc = accessories[0]
    const kind = classifyAccessory(acc)
    const region = kind === 'waist'
      ? { x: 52, y: 46, width: 42, height: 18 }
      : kind === 'carried'
        ? { x: 52, y: 44, width: 42, height: 38 }
        : { x: 59, y: 68, width: 28, height: 18 }
    boxes.push(makeBox(acc, 'accessory_1', region, 6))
  } else if (accessories.length === 2) {
    const acc1Kind = classifyAccessory(accessories[0])
    const acc2Kind = classifyAccessory(accessories[1])
    const reg1 = acc1Kind === 'accent'
      ? { x: 59, y: 44, width: 28, height: 18 }
      : { x: 52, y: 44, width: 42, height: 18 }
    const reg2 = acc2Kind === 'accent'
      ? { x: 59, y: 70, width: 28, height: 18 }
      : { x: 52, y: 68, width: 42, height: 22 }
    boxes.push(makeBox(accessories[0], 'accessory_1', reg1, 6))
    boxes.push(makeBox(accessories[1], 'accessory_2', reg2, 5))
  }

  return boxes
}

function composeSeparatesWithoutOuterwear(items: WardrobeItem[]): LayoutBox[] {
  const top = items.find((i) => i.layer_role === 'base_layer')!
  const bottom = items.find((i) => i.layer_role === 'bottom')!
  const footwear = items.find((i) => i.layer_role === 'footwear')!
  const accessories = sortAccessories(items.filter((i) => i.layer_role === 'accessory'))

  const boxes: LayoutBox[] = [
    // Left column: Top -> Trousers (full vertical column)
    makeBox(top, 'top', { x: 6, y: 4, width: 40, height: 34 }, 10),
    makeBox(bottom, 'bottom', { x: 6, y: 41, width: 40, height: 51 }, 8),
  ]

  if (accessories.length === 0) {
    // Right column: Footwear
    boxes.push(makeBox(footwear, 'footwear', { x: 52, y: 48, width: 42, height: 44 }, 7))
  } else if (accessories.length === 1) {
    // Right column: Accessory above Footwear
    const kind = classifyAccessory(accessories[0])
    const accRegion = kind === 'accent'
      ? { x: 59, y: 14, width: 28, height: 18 }
      : { x: 52, y: 10, width: 42, height: 30 }
    boxes.push(makeBox(accessories[0], 'accessory_1', accRegion, 6))
    boxes.push(makeBox(footwear, 'footwear', { x: 52, y: 46, width: 42, height: 46 }, 7))
  } else if (accessories.length === 2) {
    // Right column: 2 Accessories above Footwear
    const acc1Kind = classifyAccessory(accessories[0])
    const acc2Kind = classifyAccessory(accessories[1])
    const reg1 = acc1Kind === 'accent'
      ? { x: 59, y: 8, width: 28, height: 18 }
      : { x: 52, y: 6, width: 42, height: 20 }
    const reg2 = acc2Kind === 'accent'
      ? { x: 59, y: 30, width: 28, height: 18 }
      : { x: 52, y: 28, width: 42, height: 20 }
    boxes.push(makeBox(accessories[0], 'accessory_1', reg1, 6))
    boxes.push(makeBox(accessories[1], 'accessory_2', reg2, 5))
    boxes.push(makeBox(footwear, 'footwear', { x: 52, y: 52, width: 42, height: 40 }, 7))
  }

  return boxes
}

function composeOnePieceWithOuterwear(items: WardrobeItem[]): LayoutBox[] {
  const onePiece = items.find((i) => i.layer_role === 'one_piece')!
  const footwear = items.find((i) => i.layer_role === 'footwear')!
  const outerwear = items.find((i) => i.layer_role === 'outerwear')!
  const accessories = sortAccessories(items.filter((i) => i.layer_role === 'accessory'))

  const boxes: LayoutBox[] = [
    // Left column: One-piece dominant + Footwear below
    makeBox(onePiece, 'one_piece', { x: 6, y: 4, width: 44, height: 62 }, 10),
    makeBox(footwear, 'footwear', { x: 6, y: 68, width: 42, height: 24 }, 7),

    // Right column: Outerwear
    makeBox(outerwear, 'outerwear', { x: 52, y: 4, width: 42, height: 36 }, 9),
  ]

  if (accessories.length === 1) {
    const kind = classifyAccessory(accessories[0])
    const accRegion = kind === 'accent'
      ? { x: 59, y: 68, width: 28, height: 18 }
      : kind === 'carried'
        ? { x: 52, y: 46, width: 42, height: 44 }
        : { x: 52, y: 48, width: 42, height: 20 }
    boxes.push(makeBox(accessories[0], 'accessory_1', accRegion, 6))
  } else if (accessories.length === 2) {
    const acc1Kind = classifyAccessory(accessories[0])
    const acc2Kind = classifyAccessory(accessories[1])
    const reg1 = acc1Kind === 'accent'
      ? { x: 59, y: 46, width: 28, height: 18 }
      : { x: 52, y: 44, width: 42, height: 20 }
    const reg2 = acc2Kind === 'accent'
      ? { x: 59, y: 70, width: 28, height: 18 }
      : { x: 52, y: 68, width: 42, height: 22 }
    boxes.push(makeBox(accessories[0], 'accessory_1', reg1, 6))
    boxes.push(makeBox(accessories[1], 'accessory_2', reg2, 5))
  }

  return boxes
}

function composeOnePieceWithoutOuterwear(items: WardrobeItem[]): LayoutBox[] {
  const onePiece = items.find((i) => i.layer_role === 'one_piece')!
  const footwear = items.find((i) => i.layer_role === 'footwear')!
  const accessories = sortAccessories(items.filter((i) => i.layer_role === 'accessory'))

  if (accessories.length === 0) {
    // 2-item look: Centered dominant one-piece, grounded footwear
    return [
      makeBox(onePiece, 'one_piece', { x: 14, y: 4, width: 72, height: 64 }, 10),
      makeBox(footwear, 'footwear', { x: 26, y: 70, width: 48, height: 22 }, 7),
    ]
  }

  // With accessories: One-piece and footwear on left, accessories on right
  const boxes: LayoutBox[] = [
    makeBox(onePiece, 'one_piece', { x: 6, y: 4, width: 52, height: 64 }, 10),
    makeBox(footwear, 'footwear', { x: 8, y: 70, width: 44, height: 22 }, 7),
  ]

  if (accessories.length === 1) {
    const kind = classifyAccessory(accessories[0])
    const region = kind === 'accent'
      ? { x: 64, y: 26, width: 28, height: 18 }
      : kind === 'carried'
        ? { x: 60, y: 20, width: 34, height: 38 }
        : { x: 60, y: 28, width: 34, height: 20 }
    boxes.push(makeBox(accessories[0], 'accessory_1', region, 6))
  } else if (accessories.length === 2) {
    const acc1Kind = classifyAccessory(accessories[0])
    const acc2Kind = classifyAccessory(accessories[1])
    const reg1 = acc1Kind === 'accent'
      ? { x: 64, y: 14, width: 28, height: 18 }
      : { x: 60, y: 12, width: 34, height: 26 }
    const reg2 = acc2Kind === 'accent'
      ? { x: 64, y: 48, width: 28, height: 18 }
      : { x: 60, y: 44, width: 34, height: 26 }
    boxes.push(makeBox(accessories[0], 'accessory_1', reg1, 6))
    boxes.push(makeBox(accessories[1], 'accessory_2', reg2, 5))
  }

  return boxes
}

function composeCalibrationTemplate(items: WardrobeItem[]): LayoutBox[] | null {
  const roleCounts: Partial<Record<LayerRole, number>> = {}
  for (const item of items) {
    roleCounts[item.layer_role] = (roleCounts[item.layer_role] ?? 0) + 1
  }

  const onePieceCount = roleCounts['one_piece'] ?? 0
  const topCount = roleCounts['base_layer'] ?? 0
  const bottomCount = roleCounts['bottom'] ?? 0
  const footwearCount = roleCounts['footwear'] ?? 0
  const outerwearCount = roleCounts['outerwear'] ?? 0
  const accessoryCount = roleCounts['accessory'] ?? 0

  // Must have exactly 1 footwear and at most 2 accessories
  if (footwearCount !== 1 || accessoryCount > 2 || outerwearCount > 1) {
    return null
  }

  // Case 1: One-Piece outfit
  if (onePieceCount === 1 && topCount === 0 && bottomCount === 0) {
    if (outerwearCount === 1) {
      return composeOnePieceWithOuterwear(items)
    }
    return composeOnePieceWithoutOuterwear(items)
  }

  // Case 2: Separates outfit
  if (onePieceCount === 0 && topCount === 1 && bottomCount === 1) {
    if (outerwearCount === 1) {
      return composeSeparatesWithOuterwear(items)
    }
    return composeSeparatesWithoutOuterwear(items)
  }

  // Any other combination falls back safely
  return null
}

// ---------------------------------------------------------------------------
// Dynamic Fallback Composition (Non-Calibration & Unsupported Inputs)
// ---------------------------------------------------------------------------

function roleSize(role: LayerRole, count: number, stageRatio: number, isCalibration = false): BoxSize {
  const widths = isCalibration ? calibrationWidths : mobileWidths
  const density = count <= 2 ? 1.08 : count === 3 ? 1.03 : count === 4 ? 0.97 : 0.92
  const landscapeFactor = stageRatio >= 1.45 ? 0.76 : stageRatio >= 1.25 ? 0.9 : 1
  const width = widths[role] * density * landscapeFactor
  const height = width * stageRatio / roleAspect[role]
  return { width, height }
}

function preferredAnchors(role: LayerRole, roles: Set<LayerRole>, isCalibration = false): Anchor[] {
  const hasSideColumn = roles.has('outerwear') || roles.has('accessory')
  const onePiece = roles.has('one_piece')
  if (role === 'one_piece') {
    if (isCalibration) {
      return hasSideColumn
        ? [{ x: 38, y: 44 }, anchors.upperLeft, anchors.upperCenter, anchors.midLeft]
        : [{ x: 50, y: 42 }, anchors.upperCenter, anchors.upperLeft, anchors.midCenter]
    }
    return hasSideColumn
      ? [anchors.upperLeft, anchors.upperCenter, anchors.midLeft]
      : [anchors.upperCenter, anchors.upperLeft, anchors.midCenter]
  }
  if (role === 'base_layer') return roles.has('outerwear')
    ? [anchors.upperLeft, anchors.upperCenter, anchors.midLeft]
    : [anchors.upperCenter, anchors.upperLeft, anchors.upperRight]
  if (role === 'bottom') return hasSideColumn
    ? [anchors.midLeft, anchors.midCenter, anchors.midRight]
    : [anchors.midCenter, anchors.midLeft, anchors.midRight]
  if (role === 'outerwear') return [anchors.upperRight, anchors.midRight, anchors.lowerRight]
  if (role === 'footwear') {
    if (onePiece && isCalibration) {
      return hasSideColumn
        ? [anchors.lowerLeft, anchors.lowerCenter, anchors.lowerRight]
        : [{ x: 50, y: 78 }, anchors.lowerCenter, anchors.lowerRight, anchors.lowerLeft]
    }
    return onePiece
      ? (hasSideColumn ? [anchors.lowerLeft, anchors.lowerCenter, anchors.lowerRight] : [anchors.lowerRight, anchors.lowerCenter, anchors.lowerLeft])
      : [anchors.lowerCenter, anchors.lowerLeft, anchors.lowerRight]
  }
  return [anchors.midRight, anchors.lowerRight, anchors.upperRight, anchors.lowerCenter]
}

function fromCenter(anchor: Anchor, size: BoxSize, itemId: string, role: LayerRole, slot: string, zIndex: number): LayoutBox {
  return { itemId, role, slot, x: anchor.x - size.width / 2, y: anchor.y - size.height / 2, width: size.width, height: size.height, zIndex }
}

function inside(box: LayoutBox) {
  return box.x >= SAFE.left && box.y >= SAFE.top && box.x + box.width <= SAFE.right && box.y + box.height <= SAFE.bottom
}

function collides(box: LayoutBox, placed: LayoutBox[]) {
  return placed.some((other) => !(
    box.x + box.width + MIN_GAP <= other.x || other.x + other.width + MIN_GAP <= box.x ||
    box.y + box.height + MIN_GAP <= other.y || other.y + other.height + MIN_GAP <= box.y
  ))
}

function fallbackAnchors(preferred: Anchor) {
  const candidates: Anchor[] = []
  for (let y = 16; y <= 82; y += 6) for (let x = 14; x <= 86; x += 6) candidates.push({ x, y })
  return candidates.sort((left, right) => {
    const leftDistance = (left.x - preferred.x) ** 2 + (left.y - preferred.y) ** 2
    const rightDistance = (right.x - preferred.x) ** 2 + (right.y - preferred.y) ** 2
    return leftDistance - rightDistance || left.y - right.y || left.x - right.x
  })
}

function placeItem(item: WardrobeItem, slot: string, size: BoxSize, candidates: Anchor[], placed: LayoutBox[], zIndex: number) {
  const allCandidates = [...candidates, ...fallbackAnchors(candidates[0])]
  for (const shrink of [1, 0.94, 0.88, 0.82]) {
    const shrunk = { width: size.width * shrink, height: size.height * shrink }
    for (const anchor of allCandidates) {
      const box = fromCenter(anchor, shrunk, item.id, item.layer_role, slot, zIndex)
      if (inside(box) && !collides(box, placed)) return box
    }
  }

  for (const shrink of [0.76, 0.7, 0.64, 0.58]) {
    const shrunk = { width: size.width * shrink, height: size.height * shrink }
    const anchor = allCandidates.find((candidate) => {
      const box = fromCenter(candidate, shrunk, item.id, item.layer_role, slot, zIndex)
      return inside(box) && !collides(box, placed)
    })
    if (anchor) return fromCenter(anchor, shrunk, item.id, item.layer_role, slot, zIndex)
  }

  const shrunk = { width: size.width * 0.58, height: size.height * 0.58 }
  return fromCenter(anchors.midCenter, shrunk, item.id, item.layer_role, slot, zIndex)
}

function normalizeCluster(boxes: LayoutBox[], stageRatio: number, isCalibration = false) {
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  const clusterWidth = maxX - minX
  const clusterHeight = maxY - minY
  const targetWidth = isCalibration ? (stageRatio >= 1.45 ? 80 : 86) : stageRatio >= 1.45 ? 76 : 80
  const targetHeight = isCalibration ? 86 : 84
  const maxScale = isCalibration ? 1.45 : 1.2
  const scale = Math.min(maxScale, targetWidth / clusterWidth, targetHeight / clusterHeight)
  const scaledWidth = clusterWidth * scale
  const scaledHeight = clusterHeight * scale
  const originX = 50 - scaledWidth / 2
  const originY = (SAFE.top + SAFE.bottom) / 2 - scaledHeight / 2

  return boxes.map((box) => ({
    ...box,
    x: originX + (box.x - minX) * scale,
    y: originY + (box.y - minY) * scale,
    width: box.width * scale,
    height: box.height * scale,
  }))
}

export function composeOutfit(items: WardrobeItem[], stageRatio: number, options?: ComposeOutfitOptions) {
  const isCalibration = Boolean(options?.calibration)

  // Calibration uses deterministic compact editorial templates where supported
  if (isCalibration) {
    const templateBoxes = composeCalibrationTemplate(items)
    if (templateBoxes) {
      return { family: familyFor(items), boxes: templateBoxes }
    }
  }

  // Dynamic fallback for non-calibration screens or unsupported outfit structures
  const roles = new Set(items.map((item) => item.layer_role))
  const accessorySlots = new Map<string, number>()
  let accessoryIndex = 0
  const ordered = [...items].sort((left, right) => importance[left.layer_role] - importance[right.layer_role] || left.id.localeCompare(right.id))
  const placed: LayoutBox[] = []

  for (const item of ordered) {
    if (item.layer_role === 'accessory') accessorySlots.set(item.id, ++accessoryIndex)
    const slot = item.layer_role === 'base_layer' ? 'top' : item.layer_role === 'accessory' ? `accessory_${accessorySlots.get(item.id)}` : item.layer_role
    const size = roleSize(item.layer_role, items.length, stageRatio, isCalibration)
    placed.push(placeItem(item, slot, size, preferredAnchors(item.layer_role, roles, isCalibration), placed, 10 - importance[item.layer_role]))
  }

  return { family: familyFor(items), boxes: normalizeCluster(placed, stageRatio, isCalibration) }
}

export const compositionBounds = SAFE
