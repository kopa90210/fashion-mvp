import { describe, expect, it } from 'vitest'
import { recommendOutfits, type WardrobeItem } from './engine'
import type { QuizSignals, StyleVector } from '@/src/lib/quiz/scoring'

const dna: StyleVector = {}
const signals: QuizSignals = {
  primaryOccasion: 'mixed', style: 'minimal', fit: 'regular', formality: 'put-together', exploration: 'familiar',
}
const item = (id: string, layer_role: WardrobeItem['layer_role'], changes: Partial<WardrobeItem> = {}): WardrobeItem =>
  ({ id, layer_role, display_name: id, image_url: null, style_tags: { minimal: 1 }, ...changes })
const bottom = item('bottom', 'bottom')
const shoes = item('shoes', 'footwear')
const winner = (a: WardrobeItem, b: WardrobeItem, prefs: QuizSignals) =>
  recommendOutfits([a, b, bottom, shoes], dna, { topN: 1, signals: prefs })[0].items[0].id

describe('quiz signals in recommendation ranking', () => {
  it('style changes the recommended top', () => {
    const minimal = item('minimal', 'base_layer', { style_tags: { minimal: 1 } })
    const street = item('street', 'base_layer', { style_tags: { streetwear: 1 } })
    expect(winner(minimal, street, signals)).toBe('minimal')
    expect(winner(minimal, street, { ...signals, style: 'streetwear' })).toBe('street')
  })

  it('fit changes the recommended top when weights exist', () => {
    const slim = item('slim', 'base_layer', { fit: { weights: { slim: 1, regular: 0 } } })
    const regular = item('regular', 'base_layer', { fit: { weights: { slim: 0, regular: 1 } } })
    expect(winner(slim, regular, signals)).toBe('regular')
    expect(winner(slim, regular, { ...signals, fit: 'slim' })).toBe('slim')
  })

  it('formality changes the recommended top when scores exist', () => {
    const casual = item('casual', 'base_layer', { formality_score: 0.1 })
    const formal = item('formal', 'base_layer', { formality_score: 0.9 })
    expect(winner(casual, formal, { ...signals, formality: 'casual' })).toBe('casual')
    expect(winner(casual, formal, { ...signals, formality: 'formal' })).toBe('formal')
  })

  it('occasion changes the recommended top through the documented formality proxy', () => {
    const errands = item('errands', 'base_layer', { formality_score: 0.2 })
    const evening = item('evening', 'base_layer', { formality_score: 0.8 })
    expect(winner(errands, evening, { ...signals, primaryOccasion: 'everyday-errands' })).toBe('errands')
    expect(winner(errands, evening, { ...signals, primaryOccasion: 'going-out' })).toBe('evening')
  })

  it('exploration changes the recommended top when other style tags exist', () => {
    const familiar = item('familiar', 'base_layer', { style_tags: { minimal: 1 } })
    const bold = item('bold', 'base_layer', { style_tags: { minimal: 0.8, streetwear: 1 } })
    expect(winner(familiar, bold, signals)).toBe('familiar')
    expect(winner(familiar, bold, { ...signals, exploration: 'bold' })).toBe('bold')
  })

  it('preserves the legacy vector-only score when no signals are stored', () => {
    const a = item('a', 'base_layer')
    const b = item('b', 'base_layer')
    expect(recommendOutfits([a, b, bottom, shoes], dna, { topN: 1 })[0].items[0].id).toBe('a')
  })
})
