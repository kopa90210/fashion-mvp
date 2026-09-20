import { getOutfitPhotoSessions, getUserDraftItems, getUserWardrobeItems } from '@/src/app/actions/wardrobe'
import { getWishlistItems } from '@/src/app/actions/wishlist'
import { WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'
import WardrobeScreen from './WardrobeScreen'

export default async function WardrobePage() {
  const [items, drafts, wishlistItems, outfitPhotos] = await Promise.all([getUserWardrobeItems(), getUserDraftItems(), getWishlistItems(), getOutfitPhotoSessions()])
  return <WardrobeScreen items={items} drafts={drafts} wishlistItems={wishlistItems} outfitPhotos={outfitPhotos} categories={WARDROBE_CATEGORIES} />
}
