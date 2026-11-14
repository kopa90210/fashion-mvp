import type { QuizSignals } from '@/src/lib/quiz/scoring'
import type { QuizSignalItem } from './types'

export interface QuizSignalDefinition {
  key: keyof QuizSignals
  label: string
  options: Record<string, string>
}

/**
 * Single source of truth for the 5 onboarding quiz signal definitions
 * and their canonical display labels.
 * Matches `QUIZ_QUESTIONS` in `src/lib/quiz/questions.ts`.
 */
export const QUIZ_SIGNAL_DEFINITIONS: QuizSignalDefinition[] = [
  {
    key: 'primaryOccasion',
    label: 'Primary Occasion',
    options: {
      'work-university': 'Work or university',
      'everyday-errands': 'Everyday errands',
      'going-out': 'Going out',
      'mixed': 'A mix of everything',
    },
  },
  {
    key: 'style',
    label: 'Style Aesthetic',
    options: {
      'minimal': 'Minimal',
      'classic': 'Classic and polished',
      'relaxed': 'Relaxed',
      'streetwear': 'Streetwear',
    },
  },
  {
    key: 'fit',
    label: 'Preferred Fit',
    options: {
      'slim': 'Slim',
      'regular': 'Regular',
      'relaxed': 'Relaxed',
      'oversized': 'Oversized',
    },
  },
  {
    key: 'formality',
    label: 'Preferred Formality',
    options: {
      'casual': 'Comfortable and casual',
      'put-together': 'Put together',
      'polished': 'Polished',
      'formal': 'Sharp and formal',
    },
  },
  {
    key: 'exploration',
    label: 'Exploration Level',
    options: {
      'familiar': 'Keep it familiar',
      'small-twist': 'Add a small twist',
      'mix-it-up': 'Mix things up',
      'bold': 'Show me bold ideas',
    },
  },
]

/**
 * Format raw parsed quiz signals into display-ready QuizSignalItem array
 * using canonical answer labels.
 */
export function formatQuizSignals(signals: QuizSignals | null): QuizSignalItem[] | null {
  if (!signals || typeof signals !== 'object') return null

  const items: QuizSignalItem[] = []

  for (const def of QUIZ_SIGNAL_DEFINITIONS) {
    const rawVal = signals[def.key]
    if (typeof rawVal === 'string' && def.options[rawVal]) {
      items.push({
        key: def.key,
        label: def.label,
        valueKey: rawVal,
        valueLabel: def.options[rawVal],
      })
    }
  }

  return items.length > 0 ? items : null
}
