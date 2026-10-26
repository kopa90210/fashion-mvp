import { beforeEach, describe, expect, it, vi } from 'vitest'
import { QUIZ_QUESTIONS, QUIZ_QUESTIONS_FOR_SCORING } from '@/src/lib/quiz/questions'
import { computeStyleVector, type QuizAnswer } from '@/src/lib/quiz/scoring'

const state = vi.hoisted(() => ({
  user: { data: { user: { id: 'existing-user' } }, error: null as null | Error },
  rpc: vi.fn(),
  upsert: vi.fn(),
}))
vi.mock('@/src/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => state.user },
    from: () => ({ upsert: state.upsert }),
    rpc: state.rpc,
  }),
}))
vi.mock('next/navigation', () => ({ redirect: vi.fn() }))
const { submitStyleQuiz } = await import('./actions')
const answers: QuizAnswer[] = QUIZ_QUESTIONS.map((question) => ({
  questionId: question.id, optionId: question.options[0].id,
}))

beforeEach(() => {
  vi.clearAllMocks()
  state.upsert.mockResolvedValue({ error: null })
  state.rpc.mockResolvedValue({ data: 1, error: null })
})

describe('submitStyleQuiz', () => {
  it('derives the vector and five signals on the server for an existing user', async () => {
    await submitStyleQuiz(answers)
    expect(state.upsert).toHaveBeenCalledWith({ id: 'existing-user' }, { onConflict: 'id' })
    expect(state.rpc).toHaveBeenCalledWith('submit_style_quiz', {
      p_vector: computeStyleVector(answers, QUIZ_QUESTIONS_FOR_SCORING),
      p_shopping_motivation: null,
      p_risk_tolerance: null,
      p_quiz_signals: {
        primaryOccasion: 'work-university', style: 'minimal', fit: 'slim', formality: 'casual', exploration: 'familiar',
      },
    })
  })

  it.each([
    { invalid: answers.slice(0, 4) },
    { invalid: [...answers.slice(0, 4), answers[0]] },
    { invalid: [...answers.slice(0, 4), { questionId: 'exploration-level', optionId: 'made-up' }] },
  ])('rejects incomplete, duplicate or unknown selections', async ({ invalid }) => {
    await expect(submitStyleQuiz(invalid)).rejects.toThrow()
    expect(state.rpc).not.toHaveBeenCalled()
  })

  it('reports persistence errors', async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: 'db failure' } })
    await expect(submitStyleQuiz(answers)).rejects.toThrow('db failure')
  })
})
