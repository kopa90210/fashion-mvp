import type { QuizImagePreference } from './imageSet'

export const CATALOG_COLLECTIONS = [
  { id: 'feminine', label: 'Women’s collection' },
  { id: 'masculine', label: 'Men’s collection' },
] as const

export function parseCatalogCollection(value: unknown): QuizImagePreference | null {
  return value === 'masculine' || value === 'feminine' ? value : null
}

export function catalogSelectionHref(value: unknown): string {
  const collection = parseCatalogCollection(value)
  return collection ? `/quiz?done=true&collection=${collection}` : '/quiz?done=true'
}
