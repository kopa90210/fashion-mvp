import { describe, expect, it } from 'vitest'
import type { LayerRole, WardrobeItem } from '@/src/lib/outfit/engine'
import {
  classifyAccessory,
  composeOutfit,
  compositionBounds,
  type LayoutBox,
} from './composition'

const makeItems = (roles: LayerRole[]): WardrobeItem[] =>
  roles.map((layer_role, index) => ({
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

function expectSafeComposition(boxes: LayoutBox[]) {
  for (const box of boxes) {
    expect(Number.isFinite(box.x)).toBe(true)
    expect(Number.isFinite(box.y)).toBe(true)
    expect(Number.isFinite(box.width)).toBe(true)
    expect(Number.isFinite(box.height)).toBe(true)
    expect(box.width).toBeGreaterThan(0)
    expect(box.height).toBeGreaterThan(0)
    expect(box.x).toBeGreaterThanOrEqual(compositionBounds.left - 0.001)
    expect(box.y).toBeGreaterThanOrEqual(compositionBounds.top - 0.001)
    expect(box.x + box.width).toBeLessThanOrEqual(compositionBounds.right + 0.001)
    expect(box.y + box.height).toBeLessThanOrEqual(compositionBounds.bottom + 0.001)
  }
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      expect(
        overlaps(boxes[left], boxes[right]),
        `Boxes overlap: ${boxes[left].role} (${boxes[left].x}, ${boxes[left].y}, ${boxes[left].width}, ${boxes[left].height}) vs ${boxes[right].role} (${boxes[right].x}, ${boxes[right].y}, ${boxes[right].width}, ${boxes[right].height})`
      ).toBe(false)
    }
  }
}

describe('dynamic outfit composition (default / non-calibration)', () => {
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

  it('preserves baseline output coordinates when calibration is false', () => {
    const items = makeItems(['base_layer', 'bottom', 'footwear'])
    const standard = composeOutfit(items, 16 / 9)
    const explicitFalse = composeOutfit(items, 16 / 9, { calibration: false })
    expect(standard).toEqual(explicitFalse)
  })
})

describe('calibration editorial outfit templates', () => {
  describe('accessory classification', () => {
    it('prefers structured subcategory metadata', () => {
      const belt: WardrobeItem = {
        id: 'acc-1',
        display_name: 'Fancy Accessory',
        image_url: '/acc.png',
        layer_role: 'accessory',
        style_tags: {},
        subcategory: 'leather belt',
      }
      expect(classifyAccessory(belt)).toBe('waist')

      const bag: WardrobeItem = {
        id: 'acc-2',
        display_name: 'Everyday item',
        image_url: '/bag.png',
        layer_role: 'accessory',
        style_tags: {},
        subcategory: 'tote bag',
      }
      expect(classifyAccessory(bag)).toBe('carried')
    })

    it('falls back to display_name when subcategory is missing', () => {
      const sunglasses: WardrobeItem = {
        id: 'acc-3',
        display_name: 'Classic Black Sunglasses',
        image_url: '/sunglasses.png',
        layer_role: 'accessory',
        style_tags: {},
      }
      expect(classifyAccessory(sunglasses)).toBe('accent')

      const belt: WardrobeItem = {
        id: 'acc-4',
        display_name: 'Woven Belt',
        image_url: '/belt.png',
        layer_role: 'accessory',
        style_tags: {},
      }
      expect(classifyAccessory(belt)).toBe('waist')
    })
  })

  describe('Template A: Separates with Outerwear', () => {
    it('places top, trousers, and footwear aligned on left, outerwear on right (0 accessories)', () => {
      const items = makeItems(['base_layer', 'bottom', 'outerwear', 'footwear'])
      const { boxes } = composeOutfit(items, 4 / 5, { calibration: true })

      expect(boxes.length).toBe(4)
      expectSafeComposition(boxes)

      const top = boxes.find((b) => b.role === 'base_layer')!
      const bottom = boxes.find((b) => b.role === 'bottom')!
      const footwear = boxes.find((b) => b.role === 'footwear')!
      const outerwear = boxes.find((b) => b.role === 'outerwear')!

      // Left column vertical alignment
      expect(top.x).toBeLessThan(50)
      expect(bottom.x).toBeLessThan(50)
      expect(footwear.x).toBeLessThan(50)
      expect(top.x).toBe(bottom.x)
      expect(bottom.x).toBe(footwear.x)

      // Strict vertical ordering with gutters
      expect(bottom.y).toBeGreaterThan(top.y + top.height)
      expect(footwear.y).toBeGreaterThan(bottom.y + bottom.height)

      // Right column
      expect(outerwear.x).toBeGreaterThan(50)
      expect(outerwear.x).toBeGreaterThan(top.x + top.width)
    })

    it('handles 1 accessory (e.g. belt in waist region or eyewear below)', () => {
      const items: WardrobeItem[] = [
        ...makeItems(['base_layer', 'bottom', 'outerwear', 'footwear']),
        {
          id: 'belt-1',
          display_name: 'Leather Belt',
          image_url: '/belt.png',
          layer_role: 'accessory',
          style_tags: {},
        },
      ]
      const { boxes } = composeOutfit(items, 4 / 5, { calibration: true })

      expect(boxes.length).toBe(5)
      expectSafeComposition(boxes)

      const belt = boxes.find((b) => b.itemId === 'belt-1')!
      const outerwear = boxes.find((b) => b.role === 'outerwear')!

      // Belt is in right column below outerwear
      expect(belt.x).toBeGreaterThan(50)
      expect(belt.y).toBeGreaterThan(outerwear.y + outerwear.height)
    })

    it('handles 2 accessories (e.g. belt + sunglasses) matching Reference 1 layout', () => {
      const items: WardrobeItem[] = [
        ...makeItems(['base_layer', 'bottom', 'outerwear', 'footwear']),
        {
          id: 'belt-1',
          display_name: 'Leather Belt',
          image_url: '/belt.png',
          layer_role: 'accessory',
          style_tags: {},
        },
        {
          id: 'sunglasses-1',
          display_name: 'Black Sunglasses',
          image_url: '/sunglasses.png',
          layer_role: 'accessory',
          style_tags: {},
        },
      ]
      const { boxes } = composeOutfit(items, 4 / 5, { calibration: true })

      expect(boxes.length).toBe(6)
      expectSafeComposition(boxes)

      const belt = boxes.find((b) => b.itemId === 'belt-1')!
      const glasses = boxes.find((b) => b.itemId === 'sunglasses-1')!
      const outerwear = boxes.find((b) => b.role === 'outerwear')!

      // Right column has outerwear -> belt -> glasses
      expect(belt.y).toBeGreaterThan(outerwear.y + outerwear.height)
      expect(glasses.y).toBeGreaterThan(belt.y + belt.height)
    })
  })

  describe('Template B: Separates without Outerwear', () => {
    it('places top & trousers on left, footwear lower right (0 accessories)', () => {
      const items = makeItems(['base_layer', 'bottom', 'footwear'])
      const { boxes } = composeOutfit(items, 1, { calibration: true })

      expect(boxes.length).toBe(3)
      expectSafeComposition(boxes)

      const top = boxes.find((b) => b.role === 'base_layer')!
      const bottom = boxes.find((b) => b.role === 'bottom')!
      const footwear = boxes.find((b) => b.role === 'footwear')!

      // Left column
      expect(top.x).toBeLessThan(50)
      expect(bottom.x).toBeLessThan(50)
      expect(bottom.y).toBeGreaterThan(top.y + top.height)

      // Footwear lower right
      expect(footwear.x).toBeGreaterThan(50)
      expect(footwear.y).toBeGreaterThan(45)
    })

    it('places top & trousers on left, accessory upper right, footwear lower right matching Reference 3', () => {
      const items: WardrobeItem[] = [
        ...makeItems(['base_layer', 'bottom', 'footwear']),
        {
          id: 'sunglasses-1',
          display_name: 'Black Sunglasses',
          image_url: '/sunglasses.png',
          layer_role: 'accessory',
          style_tags: {},
        },
      ]
      const { boxes } = composeOutfit(items, 1, { calibration: true })

      expect(boxes.length).toBe(4)
      expectSafeComposition(boxes)

      const top = boxes.find((b) => b.role === 'base_layer')!
      const bottom = boxes.find((b) => b.role === 'bottom')!
      const glasses = boxes.find((b) => b.itemId === 'sunglasses-1')!
      const footwear = boxes.find((b) => b.role === 'footwear')!

      // Left column
      expect(top.x).toBeLessThan(50)
      expect(bottom.x).toBeLessThan(50)

      // Right column: glasses above footwear
      expect(glasses.x).toBeGreaterThan(50)
      expect(footwear.x).toBeGreaterThan(50)
      expect(footwear.y).toBeGreaterThan(glasses.y + glasses.height)

      // Footwear has generous dimensions for sneaker pairs
      expect(footwear.width).toBeGreaterThanOrEqual(40)
      expect(footwear.height).toBeGreaterThanOrEqual(40)
    })
  })

  describe('Template C: One-Piece with Outerwear', () => {
    it('places one-piece & shoes on left, outerwear & accessory on right matching Reference 2', () => {
      const items: WardrobeItem[] = [
        ...makeItems(['one_piece', 'outerwear', 'footwear']),
        {
          id: 'sunglasses-1',
          display_name: 'Sunglasses',
          image_url: '/sunglasses.png',
          layer_role: 'accessory',
          style_tags: {},
        },
      ]
      const { boxes } = composeOutfit(items, 4 / 5, { calibration: true })

      expect(boxes.length).toBe(4)
      expectSafeComposition(boxes)

      const onePiece = boxes.find((b) => b.role === 'one_piece')!
      const footwear = boxes.find((b) => b.role === 'footwear')!
      const outerwear = boxes.find((b) => b.role === 'outerwear')!
      const glasses = boxes.find((b) => b.itemId === 'sunglasses-1')!

      // Left column: dominant one-piece with shoes below
      expect(onePiece.x).toBeLessThan(50)
      expect(onePiece.height).toBeGreaterThanOrEqual(60)
      expect(footwear.x).toBeLessThan(50)
      expect(footwear.y).toBeGreaterThan(onePiece.y + onePiece.height)

      // Right column: outerwear with glasses below
      expect(outerwear.x).toBeGreaterThan(50)
      expect(glasses.x).toBeGreaterThan(50)
      expect(glasses.y).toBeGreaterThan(outerwear.y + outerwear.height)
    })
  })

  describe('Template D: One-Piece without Outerwear', () => {
    it('centers 2-item look (dress + shoes) without reserving a phantom jacket region', () => {
      const items = makeItems(['one_piece', 'footwear'])
      const { boxes } = composeOutfit(items, 4 / 5, { calibration: true })

      expect(boxes.length).toBe(2)
      expectSafeComposition(boxes)

      const onePiece = boxes.find((b) => b.role === 'one_piece')!
      const footwear = boxes.find((b) => b.role === 'footwear')!

      // Both items are horizontally centered around 50%
      const onePieceCenter = onePiece.x + onePiece.width / 2
      const footwearCenter = footwear.x + footwear.width / 2
      expect(Math.abs(onePieceCenter - 50)).toBeLessThanOrEqual(1)
      expect(Math.abs(footwearCenter - 50)).toBeLessThanOrEqual(1)

      // Large dominant one-piece
      expect(onePiece.width).toBeGreaterThanOrEqual(48)
      expect(onePiece.height).toBeGreaterThanOrEqual(60)

      // Footwear cleanly grounded beneath
      expect(footwear.y).toBeGreaterThan(onePiece.y + onePiece.height)
    })

    it('places accessories beside one-piece when present', () => {
      const items: WardrobeItem[] = [
        ...makeItems(['one_piece', 'footwear']),
        {
          id: 'bag-1',
          display_name: 'Leather Bag',
          image_url: '/bag.png',
          layer_role: 'accessory',
          style_tags: {},
        },
      ]
      const { boxes } = composeOutfit(items, 4 / 5, { calibration: true })

      expect(boxes.length).toBe(3)
      expectSafeComposition(boxes)

      const onePiece = boxes.find((b) => b.role === 'one_piece')!
      const footwear = boxes.find((b) => b.role === 'footwear')!
      const bag = boxes.find((b) => b.itemId === 'bag-1')!

      // Left: one-piece and footwear
      expect(onePiece.x).toBeLessThan(50)
      expect(footwear.x).toBeLessThan(50)

      // Right: accessory beside one-piece
      expect(bag.x).toBeGreaterThan(50)
      expect(bag.y + bag.height).toBeLessThanOrEqual(compositionBounds.bottom)
    })
  })

  describe('robustness & fallbacks', () => {
    it('falls back safely for unsupported combinations without dropping any items', () => {
      // 3 accessories + 2 tops (unsupported by standard template)
      const unsupported: WardrobeItem[] = [
        ...makeItems(['base_layer', 'base_layer', 'bottom', 'footwear', 'accessory', 'accessory', 'accessory']),
      ]
      const { boxes } = composeOutfit(unsupported, 16 / 9, { calibration: true })

      // Every input item is placed exactly once
      expect(boxes.length).toBe(unsupported.length)
      const inputIds = new Set(unsupported.map((i) => i.id))
      const placedIds = new Set(boxes.map((b) => b.itemId))
      expect(placedIds).toEqual(inputIds)

      // Finite coordinates inside stage
      for (const box of boxes) {
        expect(Number.isFinite(box.x)).toBe(true)
        expect(Number.isFinite(box.y)).toBe(true)
        expect(box.width).toBeGreaterThan(0)
        expect(box.height).toBeGreaterThan(0)
      }
    })

    it('is completely deterministic across repeated calls', () => {
      const items: WardrobeItem[] = [
        ...makeItems(['base_layer', 'bottom', 'outerwear', 'footwear']),
        {
          id: 'belt-1',
          display_name: 'Belt',
          image_url: '/belt.png',
          layer_role: 'accessory',
          style_tags: {},
        },
      ]
      const run1 = composeOutfit(items, 4 / 5, { calibration: true })
      const run2 = composeOutfit(items, 4 / 5, { calibration: true })
      expect(run1).toEqual(run2)
    })
  })
})
