import type { WardrobeItem } from '@/src/lib/outfit/engine'
import type { QuizSignals } from '@/src/lib/quiz/scoring'
import type { Collection, Occasion } from './intent'

const coreRoles = ['footwear', 'base_layer', 'bottom', 'one_piece'] as const
type CoreRole = typeof coreRoles[number]
export type WardrobeNeed = {
  role: CoreRole
  kind: 'missing' | 'variety' | 'building-block'
  possibleNewCombinations: number
}
export type DailyNeeds = { date: string; occasion: Occasion; gaps: WardrobeNeed[] }

const cairoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
})

export function cairoDay(now: number): string {
  const parts = Object.fromEntries(cairoDate.formatToParts(now).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function dailyOccasion(signals: QuizSignals | null, selected?: Occasion): Occasion {
  return selected ?? (signals?.primaryOccasion === 'work-university' ? 'work'
    : signals?.primaryOccasion === 'going-out' ? 'going-out' : 'everyday')
}

export function analyzeNeeds(items: WardrobeItem[], collection: Collection): WardrobeNeed[] {
  if (!items.length) return []
  const counts: Record<CoreRole, number> = { footwear: 0, base_layer: 0, bottom: 0, one_piece: 0 }
  for (const { layer_role: role } of items) {
    if (Object.hasOwn(counts, role)) counts[role as CoreRole] += 1
  }

  // The outfit engine supports top + bottom + shoes, or one-piece + shoes.
  // Counting those combinations is linear in wardrobe size and needs no model.
  const { footwear, base_layer: tops, bottom: bottoms, one_piece: dresses } = counts
  const complete = (tops * bottoms + dresses) * footwear
  const added = { footwear: tops * bottoms + dresses, base_layer: bottoms * footwear,
    bottom: tops * footwear, one_piece: footwear }
  // A one-piece is a valid alternative to separates, not a missing essential
  // for a healthy separates wardrobe. Never propose buying it for Men's.
  const eligible = coreRoles.filter(role => role !== 'one_piece' ||
    (collection === 'feminine' && (dresses > 0 || tops * bottoms === 0)))
  const needs = eligible.filter(role => added[role] > 0 && (complete > 0 || counts[role] === 0))
    .map((role): WardrobeNeed => ({
      role, kind: complete === 0 ? 'missing' : 'variety', possibleNewCombinations: added[role],
    }))
    .sort((a, b) => Number(b.kind === 'missing') - Number(a.kind === 'missing') ||
      b.possibleNewCombinations - a.possibleNewCombinations)
  if (needs.length || complete > 0) return needs
  return (['footwear', 'base_layer', 'bottom'] as const)
    .filter(role => counts[role] === 0 && (role === 'footwear' || dresses === 0))
    .map(role => ({ role, kind: 'building-block', possibleNewCombinations: 0 }))
}
