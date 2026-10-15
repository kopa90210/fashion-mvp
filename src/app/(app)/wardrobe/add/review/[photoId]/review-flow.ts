import type { OutfitPhotoReview } from '@/src/app/actions/wardrobe'

export type ReviewGarment = OutfitPhotoReview['garments'][number]
const order = ['top', 'bottom', 'one_piece', 'footwear', 'outerwear']
const LONG_PROCESSING_MS = 2 * 60 * 1000

export const DEFAULT_PROCESSING_SUPPORT = 'This usually takes a little while. You can leave this page — your photo will keep processing.'
export const LONG_PROCESSING_SUPPORT = 'This is taking longer than usual, but your photo is still processing.'

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
  if (jobStatus === 'retry_wait') return 'Still working on your photo'
  if (jobStatus === 'running') return 'Finding your pieces'
  return 'Your photo is in line'
}

export function processingSupport(startedAt: string, now = Date.now()) {
  const started = Date.parse(startedAt)
  if (Number.isFinite(started) && now - started >= LONG_PROCESSING_MS) return LONG_PROCESSING_SUPPORT
  return DEFAULT_PROCESSING_SUPPORT
}

export function processingFailed(status: OutfitPhotoReview['status'], jobStatus: string | null) {
  return status === 'failed' || jobStatus === 'dead_letter'
}

export function completionCopy(remaining: number) {
  return remaining > 0
    ? {
        title: 'Your choices are saved',
        supporting: 'You can come back to the remaining pieces later.',
      }
    : {
        title: 'Your wardrobe is updated',
        supporting: 'We saved the pieces you chose. StyleGraph can now use them when building outfits.',
      }
}

export function reviewComplete(finished: boolean, total: number, remaining: number) {
  return finished || (remaining === 0 && total > 0)
}
