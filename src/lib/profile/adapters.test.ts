import { describe, expect, it } from 'vitest'
import {
  adaptProfileGarment,
  extractOutfitGarments,
  profileGarmentsToWardrobeItems,
} from './adapters'

describe('profile adapters', () => {
  it('adapts jumpsuit + footwear with snake_case and camelCase attributes', () => {
    const rawJumpsuit = {
      id: 'g-jumpsuit',
      displayName: 'Black Jumpsuit',
      layerRole: 'one_piece',
      imageUrl: 'https://images.test/jumpsuit.jpg',
    }
    const rawPumps = {
      wardrobe_item_id: 'g-pumps',
      display_name: 'Black Pumps',
      layer_role: 'footwear',
      image_url: 'https://images.test/pumps.jpg',
    }

    const adaptedJumpsuit = adaptProfileGarment(rawJumpsuit)
    const adaptedPumps = adaptProfileGarment(rawPumps)

    expect(adaptedJumpsuit.displayName).toBe('Black Jumpsuit')
    expect(adaptedJumpsuit.layerRole).toBe('one_piece')
    expect(adaptedJumpsuit.category).toBe('one_piece')
    expect(adaptedJumpsuit.imageUrl).toBe('https://images.test/jumpsuit.jpg')

    expect(adaptedPumps.displayName).toBe('Black Pumps')
    expect(adaptedPumps.layerRole).toBe('footwear')
    expect(adaptedPumps.category).toBe('footwear')
    expect(adaptedPumps.imageUrl).toBe('https://images.test/pumps.jpg')

    const wardrobeItems = profileGarmentsToWardrobeItems([adaptedJumpsuit, adaptedPumps])
    expect(wardrobeItems).toHaveLength(2)
    expect(wardrobeItems[0]).toEqual({
      id: 'g-jumpsuit',
      display_name: 'Black Jumpsuit',
      layer_role: 'one_piece',
      image_url: 'https://images.test/jumpsuit.jpg',
      style_tags: {},
    })
    expect(wardrobeItems[1]).toEqual({
      id: 'g-pumps',
      display_name: 'Black Pumps',
      layer_role: 'footwear',
      image_url: 'https://images.test/pumps.jpg',
      style_tags: {},
    })
  })

  it('adapts top + bottom + footwear separates with canonical layer roles', () => {
    const rawOutfit = {
      items: [
        { id: '1', displayName: 'Silk Blouse', slot: 'top', imageUrl: '/blouse.png' },
        { id: '2', displayName: 'Tailored Pants', slot: 'bottom', imageUrl: '/pants.png' },
        { id: '3', displayName: 'Leather Loafers', slot: 'footwear', imageUrl: '/loafers.png' },
      ],
    }

    const garments = extractOutfitGarments(rawOutfit)
    expect(garments).toHaveLength(3)
    expect(garments[0].layerRole).toBe('base_layer')
    expect(garments[1].layerRole).toBe('bottom')
    expect(garments[2].layerRole).toBe('footwear')

    const wardrobeItems = profileGarmentsToWardrobeItems(garments)
    expect(wardrobeItems.map((w) => w.layer_role)).toEqual(['base_layer', 'bottom', 'footwear'])
  })

  it('supports outfits with garments property name instead of items', () => {
    const rawOutfit = {
      garments: [
        { id: 'coat', display_name: 'Trench Coat', layer_role: 'outerwear', image_url: '/coat.png' },
        { id: 'dress', display_name: 'Slip Dress', layer_role: 'one_piece', image_url: '/dress.png' },
      ],
    }

    const garments = extractOutfitGarments(rawOutfit)
    expect(garments).toHaveLength(2)
    expect(garments[0].displayName).toBe('Trench Coat')
    expect(garments[0].layerRole).toBe('outerwear')
    expect(garments[1].displayName).toBe('Slip Dress')
    expect(garments[1].layerRole).toBe('one_piece')
  })

  it('correctly flags missing media when media asset exists but image_url is null', () => {
    const itemWithMissingMedia = {
      id: 'item-missing',
      display_name: 'Deleted Garment',
      slot: 'outerwear',
      media_asset_id: 'asset-deleted',
      image_url: null,
    }

    const garment = adaptProfileGarment(itemWithMissingMedia)
    expect(garment.isMissing).toBe(true)
    expect(garment.imageUrl).toBeNull()

    const wardrobe = profileGarmentsToWardrobeItems([garment])
    expect(wardrobe[0].image_url).toBeNull()
    expect(wardrobe[0].layer_role).toBe('outerwear')
  })
})
