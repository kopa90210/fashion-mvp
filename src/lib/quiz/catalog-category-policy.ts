import type { QuizImagePreference } from './imageSet'

/** Defines curated onboarding visibility; owned wardrobe items are not filtered. */
export function canBrowseCuratedCategory(collection: QuizImagePreference, category: string): boolean {
  return category !== 'one_piece' || collection === 'feminine'
}
