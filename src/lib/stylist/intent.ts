export const occasions = ['everyday', 'work', 'going-out'] as const
export const gaps = ['base_layer', 'bottom', 'one_piece', 'footwear', 'outerwear'] as const
export type Occasion = typeof occasions[number]
export type Gap = typeof gaps[number]
export type Intent = { mode: 'restyle' | 'shop' | 'clarify'; occasion: Occasion; role: Gap | null; budget: number | null }
export type Collection = 'masculine' | 'feminine'

export function parseIntent(raw: unknown): Intent | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Partial<Intent>
  if (p.mode !== 'restyle' && p.mode !== 'shop' && p.mode !== 'clarify') return null
  if (!p.occasion || !occasions.includes(p.occasion)) return null
  if (p.role !== null && (!p.role || !gaps.includes(p.role))) return null
  if (p.budget !== null && (typeof p.budget !== 'number' || !Number.isInteger(p.budget) || p.budget < 1 || p.budget > 100_000)) return null
  return { mode: p.mode, occasion: p.occasion, role: p.role, budget: p.budget }
}

export function explicitOccasion(question: string): Occasion | null {
  const matches: Occasion[] = []
  if (/\b(work|office|interview|university)\b|الشغل|للشغل|مكتب|جامعة/i.test(question)) matches.push('work')
  if (/going out|evening|خروج|خروجة|سهرة/i.test(question)) matches.push('going-out')
  if (/\b(everyday|casual|errands)\b|يومي|مشاوير/i.test(question)) matches.push('everyday')
  return matches.length === 1 ? matches[0] : null
}

export function fallbackIntent(question: string): Intent {
  const occasion = explicitOccasion(question) ?? 'everyday'
  const role: Gap | null = /trousers?|chinos?|pants|بنطلون/i.test(question) ? 'bottom'
    : /jacket|overshirt|جاكيت/i.test(question) ? 'outerwear'
    : /shoes|sneakers|loafers|جزمة|حذاء|كوتشي/i.test(question) ? 'footwear'
    : /t-shirt|\bshirt\b|قميص|تيشيرت/i.test(question) ? 'base_layer'
    : /dress|jumpsuit|فستان/i.test(question) ? 'one_piece' : null
  const own = /my wardrobe|my closet|already own|\bwithout (?:buying|shopping)\b|\b(?:don.t|do not) (?:buy|shop)\b|دولابي|من هدومي|من اللي عندي|بدون شراء|من غير شراء/i.test(question)
  const shop = /\bbuy\b|\bshop\b|اشتري|أشتري|للشراء/i.test(question)
  const mode = own ? 'restyle' : shop ? 'shop'
    : /\bwear\b|\boutfit\b|\bstyle\b|ألبس|البس|طقم|نسق|نسّق/i.test(question) ? 'restyle'
    : role && explicitBudget(question) !== null ? 'shop' : 'clarify'
  return { mode, occasion, role, budget: null }
}

// Treat a recognizable limit as a hard ceiling even if the model misreads it.
export function explicitBudget(question: string): number | null {
  const text = question
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - '٠'.charCodeAt(0)))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - '۰'.charCodeAt(0)))
    .replace(/[,٬](?=\d{3}(?!\d))/g, '')
    .replace(/٫/g, '.')
  const limits = [...text.matchAll(/(?:under|below|up to|max(?:imum)?|تحت|أقل من|اقل من|حتى|لحد|ميزانيتي|بميزانية)\s*([\d]+)(?:\s*\.(\d+))?/gi)]
  const amounts = [...text.matchAll(/([\d]+)(?:\s*\.(\d+))?\s*(?:egp|جنيه)/gi)]
  const matches = [...limits, ...amounts]
  if (!matches.length) return null
  return Math.min(...matches.map(match => {
    const n = Number(match[1] + (match[2] ? '.' + match[2] : ''))
    if (!Number.isFinite(n)) return 0
    const ceiling = /^(under|below|تحت|[أا]قل من)/i.test(match[0]) ? Math.ceil(n) - 1 : Math.floor(n)
    return Math.max(0, Math.min(100_000, ceiling))
  }))
}

export function resolveIntent(question: string, model: Intent | null): Intent {
  const fallback = fallbackIntent(question)
  const ceiling = explicitBudget(question)
  const chosen = model ?? fallback
  return {
    ...chosen,
    mode: fallback.mode === 'clarify' ? chosen.mode : fallback.mode,
    occasion: explicitOccasion(question) ?? chosen.occasion,
    role: fallback.role ?? chosen.role,
    budget: ceiling,
  }
}
