import type { QuizQuestion } from './scoring'
import type { GenderedImageOption } from './imageSet'

export interface QuizOptionDisplay extends GenderedImageOption {
  id: string
  label: string
  weights: Record<string, number>
  gradient: string
  imageUrl?: string
  images: {
    masculine: string | null
    feminine: string | null
  }
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
const card = (
  id: string,
  label: string,
  index: number,
  weights: Record<string, number> = {},
  images: { masculine: string | null; feminine: string | null } = { masculine: null, feminine: null },
): QuizOptionDisplay =>
  ({ id, label, weights, gradient: gradients[index], images })
export const QUIZ_QUESTIONS: QuizQuestionDisplay[] = [
  {
    id: 'primary-occasion', prompt: 'Where do you need outfits most often?', options: [
      {
        ...card('work-university', 'Work or university', 0, { smart_casual: 0.4 }),
        images: {
          masculine: '/quiz/occasion-work-university-men.webp',
          feminine: '/quiz/occasion-work-university-women.webp',
        },
      },
      {
        ...card('everyday-errands', 'Everyday errands', 1, { casual: 0.4 }),
        images: {
          masculine: '/quiz/occasion-everyday-errands-men.webp',
          feminine: '/quiz/occasion-everyday-errands-women.webp',
        },
      },
      {
        ...card('going-out', 'Going out', 2, { formal: 0.3 }),
        images: {
          masculine: '/quiz/occasion-going-out-men.webp',
          feminine: '/quiz/occasion-going-out-women.webp',
        },
      },
      {
        ...card('mixed', 'A mix of everything', 3),
        images: {
          masculine: '/quiz/occasion-mixed-men.webp',
          feminine: '/quiz/occasion-mixed-women.webp',
        },
      },
    ],
  },
  {
    id: 'personal-style', prompt: 'Which look feels most like you?', options: [
      {
        ...card('minimal', 'Minimal', 0, { minimal: 1 }),
        images: {
          masculine: '/quiz/style-minimal-men.webp',
          feminine: '/quiz/style-minimal-women.webp',
        },
      },
      {
        ...card('classic', 'Classic and polished', 1, { classic: 1, smart_casual: 0.35 }),
        images: {
          masculine: '/quiz/style-classic-men.webp',
          feminine: '/quiz/style-classic-women.webp',
        },
      },
      {
        ...card('relaxed', 'Relaxed', 2, { relaxed: 1, casual: 0.4 }),
        images: {
          masculine: '/quiz/style-relaxed-men.webp',
          feminine: '/quiz/style-relaxed-women.webp',
        },
      },
      {
        ...card('streetwear', 'Streetwear', 3, { streetwear: 1, trend_forward: 0.35 }),
        images: {
          masculine: '/quiz/style-streetwear-men.webp',
          feminine: '/quiz/style-streetwear-women.webp',
        },
      },
    ],
  },
  {
    id: 'preferred-fit', prompt: 'How do you like your clothes to fit?', options: [
      {
        ...card('slim', 'Slim', 0),
        images: {
          masculine: '/quiz/fit-slim-men.webp',
          feminine: '/quiz/fit-slim-women.webp',
        },
      },
      {
        ...card('regular', 'Regular', 1),
        images: {
          masculine: '/quiz/fit-regular-men.webp',
          feminine: '/quiz/fit-regular-women.webp',
        },
      },
      {
        ...card('relaxed', 'Relaxed', 2),
        images: {
          masculine: '/quiz/fit-relaxed-men.webp',
          feminine: '/quiz/fit-relaxed-women.webp',
        },
      },
      {
        ...card('oversized', 'Oversized', 3),
        images: {
          masculine: '/quiz/fit-oversized-men.webp',
          feminine: '/quiz/fit-oversized-women.webp',
        },
      },
    ],
  },
  {
    id: 'preferred-formality', prompt: 'How dressed up do you usually want to feel?', options: [
      {
        ...card('casual', 'Comfortable and casual', 0),
        images: {
          masculine: '/quiz/formality-casual-men.webp',
          feminine: '/quiz/formality-casual-women.webp',
        },
      },
      {
        ...card('put-together', 'Put together', 1),
        images: {
          masculine: '/quiz/formality-put-together-men.webp',
          feminine: '/quiz/formality-put-together-women.webp',
        },
      },
      {
        ...card('polished', 'Polished', 2),
        images: {
          masculine: '/quiz/formality-polished-men.webp',
          feminine: '/quiz/formality-polished-women.webp',
        },
      },
      {
        ...card('formal', 'Sharp and formal', 3),
        images: {
          masculine: '/quiz/formality-formal-men.webp',
          feminine: '/quiz/formality-formal-women.webp',
        },
      },
    ],
  },
  {
    id: 'exploration-level', prompt: 'How adventurous should your outfits be?', options: [
      {
        ...card('familiar', 'Keep it familiar', 0),
        images: {
          masculine: '/quiz/exploration-familiar-men.webp',
          feminine: '/quiz/exploration-familiar-women.webp',
        },
      },
      {
        ...card('small-twist', 'Add a small twist', 1),
        images: {
          masculine: '/quiz/exploration-small-twist-men.webp',
          feminine: '/quiz/exploration-small-twist-women.webp',
        },
      },
      {
        ...card('mix-it-up', 'Mix things up', 2),
        images: {
          masculine: '/quiz/exploration-mix-it-up-men.webp',
          feminine: '/quiz/exploration-mix-it-up-women.webp',
        },
      },
      {
        ...card('bold', 'Show me bold ideas', 3),
        images: {
          masculine: '/quiz/exploration-bold-men.webp',
          feminine: '/quiz/exploration-bold-women.webp',
        },
      },
    ],
  },
]
export const QUIZ_QUESTIONS_FOR_SCORING: QuizQuestion[] = QUIZ_QUESTIONS.map(({ id, prompt, options }) => ({
  id, prompt, options: options.map(({ id: optionId, label, weights }) => ({ id: optionId, label, weights })),
}))
