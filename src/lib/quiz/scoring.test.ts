import { describe, expect, it } from 'vitest'
import { QUIZ_QUESTIONS, QUIZ_QUESTIONS_FOR_SCORING } from './questions'
import { computeStyleVector, parseQuizSignals, readQuizSignals, STYLE_DIMENSIONS } from './scoring'

const answers = QUIZ_QUESTIONS.map((question) => ({ questionId: question.id, optionId: question.options[0].id }))

describe('five-question quiz', () => {
  it('has exactly five questions with four selectable options each', () => {
    expect(QUIZ_QUESTIONS).toHaveLength(5)
    expect(QUIZ_QUESTIONS.map((question) => question.options.length)).toEqual([4, 4, 4, 4, 4])
    expect(QUIZ_QUESTIONS.map((question) => question.id)).toEqual([
      'primary-occasion', 'personal-style', 'preferred-fit', 'preferred-formality', 'exploration-level',
    ])
  })

  it('maps each answer to a typed signal and computes the style vector', () => {
    expect(parseQuizSignals(answers, QUIZ_QUESTIONS_FOR_SCORING)).toEqual({
      primaryOccasion: 'work-university', style: 'minimal', fit: 'slim', formality: 'casual', exploration: 'familiar',
    })
    const vector = computeStyleVector(answers, QUIZ_QUESTIONS_FOR_SCORING)
    expect(Object.keys(vector)).toEqual([...STYLE_DIMENSIONS])
    expect(vector.minimal).toBeGreaterThan(0)
    expect(Object.values(vector).every((value) => value >= 0 && value <= 1)).toBe(true)
  })

  it('rejects duplicate, missing and invalid answer IDs', () => {
    expect(() => parseQuizSignals(answers.slice(0, 4), QUIZ_QUESTIONS_FOR_SCORING)).toThrow()
    expect(() => parseQuizSignals([...answers.slice(0, 4), answers[0]], QUIZ_QUESTIONS_FOR_SCORING)).toThrow()
    expect(() => parseQuizSignals([...answers.slice(0, 4), { questionId: 'exploration-level', optionId: 'invalid' }], QUIZ_QUESTIONS_FOR_SCORING)).toThrow()
  })

  it('keeps legacy users without quiz signals on vector-only ranking', () => {
    expect(readQuizSignals(null)).toBeNull()
    expect(readQuizSignals({ style: 'minimal' })).toBeNull()
    expect(readQuizSignals(parseQuizSignals(answers, QUIZ_QUESTIONS_FOR_SCORING))).not.toBeNull()
  })

  it('only references image files that exist', async () => {
    const { existsSync } = await import('node:fs')
    const { join } = await import('node:path')
    for (const question of QUIZ_QUESTIONS) for (const option of question.options) {
      const paths = [option.imageUrl, option.images?.masculine, option.images?.feminine].filter(Boolean) as string[]
      for (const path of paths) expect(existsSync(join(process.cwd(), 'public', path))).toBe(true)
    }
  })
})
