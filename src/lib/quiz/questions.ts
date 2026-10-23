import type { QuizQuestion } from './scoring'

export interface QuizOptionDisplay {
  id: string
  label: string
  weights: Record<string, number>
  gradient: string
  imageUrl?: string
  images?: { masculine: string; feminine: string }
}
export interface QuizQuestionDisplay extends Omit<QuizQuestion, 'options'> {
  options: QuizOptionDisplay[]
}
const gradients = [
  'linear-gradient(145deg, #84776f, #292a31)',
  'linear-gradient(145deg, #716e65, #333a3c)',
  'linear-gradient(145deg, #7c665e, #302b34)',
  'linear-gradient(145deg, #6d7580, #292a32)',
]
const card = (id: string, label: string, index: number, weights: Record<string, number> = {}): QuizOptionDisplay =>
  ({ id, label, weights, gradient: gradients[index] })
export const QUIZ_QUESTIONS: QuizQuestionDisplay[] = [
  {
    id: 'primary-occasion', prompt: 'Where do you need outfits most often?', options: [
      card('work-university', 'Work or university', 0, { smart_casual: 0.4 }),
      card('everyday-errands', 'Everyday errands', 1, { casual: 0.4 }),
      card('going-out', 'Going out', 2, { formal: 0.3 }),
      card('mixed', 'A mix of everything', 3),
    ],
  },
  {
    id: 'personal-style', prompt: 'Which look feels most like you?', options: [
      { ...card('minimal', 'Minimal', 0, { minimal: 1 }), images: { masculine: '/quiz/q1-minimal-casual-m.jpg', feminine: '/quiz/q1-minimal-casual-f.jpg' } },
      { ...card('classic', 'Classic and polished', 1, { classic: 1, smart_casual: 0.35 }), images: { masculine: '/quiz/q1-classic-m.jpg', feminine: '/quiz/q1-classic-f.jpg' } },
      { ...card('relaxed', 'Relaxed', 2, { relaxed: 1, casual: 0.4 }), images: { masculine: '/quiz/q1-relaxed-m.jpg', feminine: '/quiz/q1-relaxed-f.jpg' } },
      { ...card('streetwear', 'Streetwear', 3, { streetwear: 1, trend_forward: 0.35 }), images: { masculine: '/quiz/q1-streetwear-m.jpg', feminine: '/quiz/q1-streetwear-f.jpg' } },
    ],
  },
  {
    id: 'preferred-fit', prompt: 'How do you like your clothes to fit?', options: [
      { ...card('slim', 'Slim', 0), imageUrl: '/quiz/q6-slim-fit.jpg' },
      { ...card('regular', 'Regular', 1), imageUrl: '/quiz/q6-regular-fit.jpg' },
      { ...card('relaxed', 'Relaxed', 2), imageUrl: '/quiz/q6-relaxed-fit.jpg' },
      { ...card('oversized', 'Oversized', 3), imageUrl: '/quiz/q6-oversized-fit.jpg' },
    ],
  },
  {
    id: 'preferred-formality', prompt: 'How dressed up do you usually want to feel?', options: [
      card('casual', 'Comfortable and casual', 0),
      card('put-together', 'Put together', 1),
      card('polished', 'Polished', 2),
      card('formal', 'Sharp and formal', 3),
    ],
  },
  {
    id: 'exploration-level', prompt: 'How adventurous should your outfits be?', options: [
      card('familiar', 'Keep it familiar', 0),
      card('small-twist', 'Add a small twist', 1),
      card('mix-it-up', 'Mix things up', 2),
      card('bold', 'Show me bold ideas', 3),
    ],
  },
]
export const QUIZ_QUESTIONS_FOR_SCORING: QuizQuestion[] = QUIZ_QUESTIONS.map(({ id, prompt, options }) => ({
  id, prompt, options: options.map(({ id: optionId, label, weights }) => ({ id: optionId, label, weights })),
}))
