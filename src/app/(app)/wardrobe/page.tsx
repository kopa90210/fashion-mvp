import { getOutfitPhotoSessions, getUserDraftItems, getUserWardrobeItems } from '@/src/app/actions/wardrobe'
import { getWishlistItems } from '@/src/app/actions/wishlist'
import { WARDROBE_CATEGORIES } from '@/src/lib/wardrobe/normalize'
import WardrobeScreen from './WardrobeScreen'
import SinglePieceReviewScreen from './add/review/SinglePieceReviewScreen'
import { createClient } from '@/src/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function WardrobePage({ searchParams }: { searchParams?: Promise<{ review?: string }> }) {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) redirect('/login')

  const [items, drafts, wishlistItems, outfitPhotos] = await Promise.all([getUserWardrobeItems(), getUserDraftItems(), getWishlistItems(), getOutfitPhotoSessions()])
  const reviewId = (await searchParams)?.review
  const reviewItem = reviewId ? drafts.find((item) => item.id === reviewId) : null
  if (reviewItem) return <SinglePieceReviewScreen initial={reviewItem} />
  return <WardrobeScreen items={items} drafts={drafts} wishlistItems={wishlistItems} outfitPhotos={outfitPhotos} categories={WARDROBE_CATEGORIES} />
}
