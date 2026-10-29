import { describe, expect, it } from 'vitest'
import { formatQuizSignals, QUIZ_SIGNAL_DEFINITIONS } from './quiz-signals'
import type { QuizSignals } from '@/src/lib/quiz/scoring'

describe('quiz-signals formatting and canonical labels', () => {
  it('formats all 5 stored signals with exact canonical display labels', () => {
    const raw: QuizSignals = {
      primaryOccasion: 'work-university',
      style: 'classic',
      fit: 'regular',
      formality: 'put-together',
      exploration: 'small-twist',
    }

    const formatted = formatQuizSignals(raw)
    expect(formatted).toEqual([
      {
        key: 'primaryOccasion',
        label: 'Primary Occasion',
        valueKey: 'work-university',
        valueLabel: 'Work or university',
      },
      {
        key: 'style',
        label: 'Style Aesthetic',
        valueKey: 'classic',
        valueLabel: 'Classic and polished',
      },
      {
        key: 'fit',
        label: 'Preferred Fit',
        valueKey: 'regular',
        valueLabel: 'Regular',
      },
      {
        key: 'formality',
        label: 'Preferred Formality',
        valueKey: 'put-together',
        valueLabel: 'Put together',
      },
      {
        key: 'exploration',
        label: 'Exploration Level',
        valueKey: 'small-twist',
        valueLabel: 'Add a small twist',
      },
    ])
  })

  it('handles other canonical answer values accurately', () => {
    const raw: QuizSignals = {
      primaryOccasion: 'everyday-errands',
      style: 'streetwear',
      fit: 'oversized',
      formality: 'formal',
      exploration: 'bold',
    }

    const formatted = formatQuizSignals(raw)
    expect(formatted?.map((s) => s.valueLabel)).toEqual([
      'Everyday errands',
      'Streetwear',
      'Oversized',
      'Sharp and formal',
      'Show me bold ideas',
    ])
  })

  it('returns null gracefully when signals are null or undefined', () => {
    expect(formatQuizSignals(null)).toBeNull()
    expect(formatQuizSignals(undefined as unknown as null)).toBeNull()
  })

  it('verifies QUIZ_SIGNAL_DEFINITIONS covers 5 questions with 4 choices each', () => {
    expect(QUIZ_SIGNAL_DEFINITIONS).toHaveLength(5)
    for (const def of QUIZ_SIGNAL_DEFINITIONS) {
      expect(Object.keys(def.options)).toHaveLength(4)
    }
  })
})
