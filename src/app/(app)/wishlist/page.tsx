import WishlistScreen from './WishlistScreen'
import { getWishlistItems } from '@/src/app/actions/wishlist'
import { WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'

export default async function WishlistPage() {
  const items = await getWishlistItems()
  return <WishlistScreen items={items} categories={WARDROBE_CATEGORIES} />
}
