import type { QuizSignals } from '@/src/lib/quiz/scoring'
import type { Occasion } from './intent'

export type EventRequest = {
  kind: 'interview' | 'wedding' | 'dinner' | 'occasion'
  occasion: Occasion
  urgent: boolean
  ownedOnly: boolean
  target: number
}
export type StyleIdentity = Pick<QuizSignals, 'style' | 'fit' | 'formality'>

export function eventRequest(question: string): EventRequest | null {
  const input = question.normalize('NFKD').replace(/\p{M}|ـ/gu, '').replace(/[أإآ]/g, 'ا')
  const kind = /\b(job interview|interview)\b|انترفيو|مقابلة (شغل|عمل)|مقابلة شخصية/i.test(input) ? 'interview'
    : /\b(wedding|engagement party|black tie)\b|فرح|زفاف|خطوبة/i.test(input) ? 'wedding'
      : /\b(dinner|date night)\b|عشا|عشاء|ديت/i.test(input) ? 'dinner'
        : /\b(event|occasion|party)\b|مناسبة|حفلة/i.test(input) ? 'occasion' : null
  // Explicit product searches continue through Ask Stylist's shopping path.
  if (!kind) return null
  const ownedOnly = /\b(without (buying|shopping)|no shopping|do not buy|don.t buy|my wardrobe|my closet)\b|من هدومي|من دولابي|بدون شراء|من غير (شراء|ما اشتري)/i.test(input)
  if (!ownedOnly && /\b(buy|shop for)\b|اشتري|للشراء/i.test(input)) return null
  return {
    kind,
    occasion: kind === 'interview' ? 'work' : 'going-out',
    urgent: /\b(today|tonight|urgent|asap|this (evening|afternoon|morning))\b|النهارده|النهاردة|الليلة|الليله|دلوقتي|بسرعة|عاجل|انهارده/i.test(input),
    ownedOnly,
    target: kind === 'interview' ? 0.68 : kind === 'wedding' ? 0.85 : kind === 'dinner' ? 0.56 : 0.6,
  }
}
