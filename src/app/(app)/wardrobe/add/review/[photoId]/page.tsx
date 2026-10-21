import { notFound } from 'next/navigation'
import { getOutfitPhotoReview } from '@/src/app/actions/wardrobe'
import ReviewOutfitScreen from './ReviewOutfitScreen'

export default async function ReviewOutfitPage({ params }: { params: Promise<{ photoId: string }> }) {
  const { photoId } = await params
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(photoId)) notFound()
  const review = await getOutfitPhotoReview(photoId).catch(() => null)
  if (!review) notFound()
  return <ReviewOutfitScreen initial={review} />
}
