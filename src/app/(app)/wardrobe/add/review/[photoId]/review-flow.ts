import type { OutfitPhotoReview } from '@/src/app/actions/wardrobe'

export type ReviewGarment = OutfitPhotoReview['garments'][number]
const order = ['top', 'bottom', 'one_piece', 'footwear', 'outerwear']

export function reviewPieces(garments: ReviewGarment[], handled: readonly string[]) {
  const remaining = garments.filter((item) => !handled.includes(item.id))
  return {
    main: remaining.filter((item) => item.category !== 'accessory').sort((a, b) => {
      const rank = (category: string | null) => order.includes(category ?? '') ? order.indexOf(category!) : order.length
      return rank(a.category) - rank(b.category)
    }),
    accessories: remaining.filter((item) => item.category === 'accessory'),
  }
}

export function processingMessage(jobStatus: string | null) {
  if (jobStatus === 'retry_wait') return 'Still working — this is taking a little longer'
  if (jobStatus === 'running') return 'Finding your pieces'
  return 'Preparing your outfit'
}
