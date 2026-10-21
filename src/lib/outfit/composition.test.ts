import { describe, expect, it } from 'vitest'
import type { LayerRole, WardrobeItem } from '@/src/lib/outfit/engine'
import { composeOutfit, compositionBounds, type LayoutBox } from './composition'

const makeItems = (roles: LayerRole[]): WardrobeItem[] => roles.map((layer_role, index) => ({
  id: `${layer_role}-${index}`,
  display_name: `${layer_role} ${index}`,
  image_url: `/${layer_role}-${index}.png`,
  layer_role,
  style_tags: {},
}))

const overlaps = (left: LayoutBox, right: LayoutBox) => !(
  left.x + left.width <= right.x || right.x + right.width <= left.x ||
  left.y + left.height <= right.y || right.y + right.height <= left.y
)

function clusterBounds(boxes: LayoutBox[]) {
  const left = Math.min(...boxes.map((box) => box.x))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const top = Math.min(...boxes.map((box) => box.y))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { left, right, top, bottom, width: right - left, height: bottom - top }
}

function expectSafeComposition(boxes: LayoutBox[]) {
  for (const box of boxes) {
    expect(box.x).toBeGreaterThanOrEqual(compositionBounds.left - 0.001)
    expect(box.y).toBeGreaterThanOrEqual(compositionBounds.top - 0.001)
    expect(box.x + box.width).toBeLessThanOrEqual(compositionBounds.right + 0.001)
    expect(box.y + box.height).toBeLessThanOrEqual(compositionBounds.bottom + 0.001)
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      expect(overlaps(boxes[left], boxes[right]), `${boxes[left].role} / ${boxes[right].role}: ${JSON.stringify([boxes[left], boxes[right]])}`).toBe(false)
    }
  }
}

describe('dynamic outfit composition', () => {
  it('is deterministic for identical input', () => {
    const items = makeItems(['base_layer', 'bottom', 'footwear', 'outerwear', 'accessory'])
    expect(composeOutfit(items, 16 / 9)).toEqual(composeOutfit(items, 16 / 9))
  })

  it.each([
    ['separates core', ['base_layer', 'bottom', 'footwear']],
    ['one-piece with accessory', ['one_piece', 'footwear', 'accessory']],
    ['full separates', ['base_layer', 'bottom', 'footwear', 'outerwear', 'accessory']],
  ] as const)('keeps %s collision-free and inside safe bounds', (_label, roles) => {
    const boxes = composeOutfit(makeItems([...roles]), 16 / 9).boxes
    expectSafeComposition(boxes)
  })

  it('preserves vertical role hierarchy', () => {
    const boxes = composeOutfit(makeItems(['base_layer', 'bottom', 'footwear']), 16 / 9).boxes
    const role = Object.fromEntries(boxes.map((box) => [box.role, box]))
    expect(role.bottom.y).toBeGreaterThan(role.base_layer.y)
    expect(role.footwear.y).toBeGreaterThan(role.base_layer.y)
    expect(role.footwear.y + role.footwear.height).toBeLessThanOrEqual(compositionBounds.bottom)
  })

  it('keeps one-piece dominant and accessories subordinate', () => {
    const boxes = composeOutfit(makeItems(['one_piece', 'footwear', 'accessory']), 1).boxes
    const role = Object.fromEntries(boxes.map((box) => [box.role, box]))
    expect(role.one_piece.width * role.one_piece.height).toBeGreaterThan(role.footwear.width * role.footwear.height)
    expect(role.accessory.width).toBeLessThan(role.one_piece.width)
    expect(role.accessory.x).toBeGreaterThan(role.one_piece.x)
    expect(role.accessory.x + role.accessory.width / 2).toBeLessThanOrEqual(78)
  })

  it('fills more of the stage with a tight compact-look cluster', () => {
    const items = makeItems(['one_piece', 'footwear', 'accessory'])
    const desktop = composeOutfit(items, 16 / 9).boxes
    const mobile = composeOutfit(items, 6 / 5).boxes

    expect(clusterBounds(desktop).width).toBeGreaterThanOrEqual(68)
    expect(clusterBounds(mobile).width).toBeGreaterThanOrEqual(72)

    for (const boxes of [desktop, mobile]) {
      const onePiece = boxes.find((box) => box.role === 'one_piece')!
      const footwear = boxes.find((box) => box.role === 'footwear')!
      expect(footwear.y).toBeGreaterThan(onePiece.y)
      expect(footwear.y - onePiece.y).toBeLessThan(50)
      expectSafeComposition(boxes)
    }
  })

  it('centers a two-item composition as one cluster', () => {
    const boxes = composeOutfit(makeItems(['one_piece', 'footwear']), 16 / 9).boxes
    const minX = Math.min(...boxes.map((box) => box.x))
    const maxX = Math.max(...boxes.map((box) => box.x + box.width))
    expect((minX + maxX) / 2).toBeCloseTo(50, 5)
    expectSafeComposition(boxes)
  })

  it('adapts existing garment placement when outerwear adds a side column', () => {
    const core = makeItems(['base_layer', 'bottom', 'footwear'])
    const withoutOuterwear = composeOutfit(core, 16 / 9).boxes
    const withOuterwear = composeOutfit([...core, ...makeItems(['outerwear'])], 16 / 9).boxes
    const topWithout = withoutOuterwear.find((box) => box.role === 'base_layer')!
    const topWith = withOuterwear.find((box) => box.role === 'base_layer')!
    expect({ x: topWith.x, y: topWith.y }).not.toEqual({ x: topWithout.x, y: topWithout.y })
    expectSafeComposition(withOuterwear)
  })

  it('keeps five-item mobile and desktop compositions safe', () => {
    const items = makeItems(['base_layer', 'bottom', 'footwear', 'outerwear', 'accessory'])
    expectSafeComposition(composeOutfit(items, 4 / 3).boxes)
    expectSafeComposition(composeOutfit(items, 5 / 3).boxes)
  })
})
