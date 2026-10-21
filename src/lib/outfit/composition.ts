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

type Anchor = { x: number; y: number }
type BoxSize = { width: number; height: number }

const SAFE = { left: 5, right: 95, top: 5, bottom: 92 }
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

const anchors = {
  upperLeft: { x: 29, y: 28 }, upperCenter: { x: 50, y: 28 }, upperRight: { x: 75, y: 28 },
  midLeft: { x: 30, y: 52 }, midCenter: { x: 50, y: 52 }, midRight: { x: 74, y: 51 },
  lowerLeft: { x: 30, y: 75 }, lowerCenter: { x: 50, y: 75 }, lowerRight: { x: 70, y: 75 },
} satisfies Record<string, Anchor>

function familyFor(items: WardrobeItem[]): CompositionFamily {
  const kind = items.some((item) => item.layer_role === 'one_piece') ? 'onepiece' : 'separates'
  const count = Math.min(5, Math.max(2, items.length)) as 2 | 3 | 4 | 5
  return `${kind}_${count}`
}

function roleSize(role: LayerRole, count: number, stageRatio: number): BoxSize {
  const density = count <= 2 ? 1.08 : count === 3 ? 1.03 : count === 4 ? 0.97 : 0.92
  const landscapeFactor = stageRatio >= 1.45 ? 0.76 : stageRatio >= 1.25 ? 0.9 : 1
  const width = mobileWidths[role] * density * landscapeFactor
  const height = width * stageRatio / roleAspect[role]
  return { width, height }
}

function preferredAnchors(role: LayerRole, roles: Set<LayerRole>): Anchor[] {
  const hasSideColumn = roles.has('outerwear') || roles.has('accessory')
  const onePiece = roles.has('one_piece')
  if (role === 'one_piece') return hasSideColumn
    ? [anchors.upperLeft, anchors.upperCenter, anchors.midLeft]
    : [anchors.upperCenter, anchors.upperLeft, anchors.midCenter]
  if (role === 'base_layer') return roles.has('outerwear')
    ? [anchors.upperLeft, anchors.upperCenter, anchors.midLeft]
    : [anchors.upperCenter, anchors.upperLeft, anchors.upperRight]
  if (role === 'bottom') return hasSideColumn
    ? [anchors.midLeft, anchors.midCenter, anchors.midRight]
    : [anchors.midCenter, anchors.midLeft, anchors.midRight]
  if (role === 'outerwear') return [anchors.upperRight, anchors.midRight, anchors.lowerRight]
  if (role === 'footwear') return onePiece
    ? (hasSideColumn ? [anchors.lowerLeft, anchors.lowerCenter, anchors.lowerRight] : [anchors.lowerRight, anchors.lowerCenter, anchors.lowerLeft])
    : [anchors.lowerCenter, anchors.lowerLeft, anchors.lowerRight]
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

function normalizeCluster(boxes: LayoutBox[], stageRatio: number) {
  const minX = Math.min(...boxes.map((box) => box.x))
  const minY = Math.min(...boxes.map((box) => box.y))
  const maxX = Math.max(...boxes.map((box) => box.x + box.width))
  const maxY = Math.max(...boxes.map((box) => box.y + box.height))
  const clusterWidth = maxX - minX
  const clusterHeight = maxY - minY
  const targetWidth = stageRatio >= 1.45 ? 76 : 80
  const targetHeight = 84
  const scale = Math.min(1.2, targetWidth / clusterWidth, targetHeight / clusterHeight)
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

export function composeOutfit(items: WardrobeItem[], stageRatio: number) {
  const roles = new Set(items.map((item) => item.layer_role))
  const accessorySlots = new Map<string, number>()
  let accessoryIndex = 0
  const ordered = [...items].sort((left, right) => importance[left.layer_role] - importance[right.layer_role] || left.id.localeCompare(right.id))
  const placed: LayoutBox[] = []

  for (const item of ordered) {
    if (item.layer_role === 'accessory') accessorySlots.set(item.id, ++accessoryIndex)
    const slot = item.layer_role === 'base_layer' ? 'top' : item.layer_role === 'accessory' ? `accessory_${accessorySlots.get(item.id)}` : item.layer_role
    const size = roleSize(item.layer_role, items.length, stageRatio)
    placed.push(placeItem(item, slot, size, preferredAnchors(item.layer_role, roles), placed, 10 - importance[item.layer_role]))
  }

  return { family: familyFor(items), boxes: normalizeCluster(placed, stageRatio) }
}

export const compositionBounds = SAFE
