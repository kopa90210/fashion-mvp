/**
 * Tests for src/app/quiz/actions.ts
 *
 * Run with:  npx vitest run src/app/quiz/actions.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { QuizAnswer, StyleVector } from '@/src/lib/quiz/scoring'
import { STYLE_DIMENSIONS } from '@/src/lib/quiz/scoring'

let tableResponses: Record<
  string,
  { data: unknown; error: unknown; count?: number }
> = {}

let upsertCalls: Record<string, unknown[]> = {}
let rpcCalls: Array<{ name: string; payload: Record<string, unknown> }> = []

function createQueryBuilder(tableName: string) {
  const response = () =>
    tableResponses[tableName] ?? { data: null, error: null }

  const builder: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation(() => {
      const resp = response()
      const eqBuilder: Record<string, unknown> = {
        single: vi.fn().mockImplementation(() => resp),
      }
      eqBuilder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: resp.data, error: resp.error, count: resp.count ?? 0 })
      return eqBuilder
    }),
    single: vi.fn().mockImplementation(() => response()),
    upsert: vi.fn().mockImplementation((payload: unknown, options: unknown) => {
      upsertCalls[tableName] = upsertCalls[tableName] || []
      upsertCalls[tableName].push({ payload, options })
      const resp = response()
      return Promise.resolve({ data: resp.data, error: resp.error })
    }),
  }

  builder.then = (resolve: (v: unknown) => unknown) =>
    resolve({ data: response().data, error: response().error, count: response().count ?? 0 })
  return builder
}

const mockSupabase = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn().mockImplementation((table: string) => createQueryBuilder(table)),
  rpc: vi.fn().mockImplementation((name: string, payload: Record<string, unknown>) => {
    rpcCalls.push({ name, payload })
    return Promise.resolve({ data: 1, error: null })
  }),
}

vi.mock('@/src/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabase),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

const { submitStyleQuiz } = await import('./actions')

const TEST_USER_ID = 'user-abc-123'

function mockAuthenticatedUser() {
  mockSupabase.auth.getUser.mockResolvedValue({
    data: { user: { id: TEST_USER_ID } },
    error: null,
  })
}

// Generate a valid base style vector (all zeros)
const validVector = Object.fromEntries(STYLE_DIMENSIONS.map(d => [d, 0])) as Record<string, number>

beforeEach(() => {
  vi.clearAllMocks()
  tableResponses = {}
  upsertCalls = {}
  rpcCalls = []
})

describe('submitStyleQuiz', () => {
  it('rejects invalid style vector', async () => {
    mockAuthenticatedUser()
    const invalidVector = { ...validVector, minimal: 'not-a-number' } as unknown as StyleVector
    await expect(submitStyleQuiz(invalidVector, [])).rejects.toThrow('Invalid style vector')
  })

  it('valid vector + answers containing both shopping-behavior and outfit-risk selections -> upsert payload includes correct shopping_motivation and risk_tolerance string values', async () => {
    mockAuthenticatedUser()
    const answers: QuizAnswer[] = [
      { questionId: 'shopping-behavior', optionId: 'matches-wardrobe' },
      { questionId: 'outfit-risk', optionId: 'safe-combinations' },
    ]

    await submitStyleQuiz(validVector, answers)

    const calls = rpcCalls
    expect(calls).toHaveLength(1)
    const payload = calls[0].payload
    expect(calls[0].name).toBe('submit_style_quiz')
    expect(payload.p_shopping_motivation).toBe('matches-wardrobe')
    expect(payload.p_risk_tolerance).toBe('safe-combinations')
    expect(payload.p_vector).toEqual(validVector)
  })

  it('valid vector + answers missing one or both of those questions -> upsert payload omits the missing field(s) entirely, does not send null', async () => {
    mockAuthenticatedUser()
    const answers: QuizAnswer[] = [
      { questionId: 'shopping-behavior', optionId: 'quality-worth-it' },
      // missing outfit-risk
    ]

    await submitStyleQuiz(validVector, answers)

    const calls = rpcCalls
    expect(calls).toHaveLength(1)
    const payload = calls[0].payload
    expect(payload.p_shopping_motivation).toBe('quality-worth-it')
    expect(payload.p_risk_tolerance).toBeNull()
  })

  it('a tampered/invalid derived value -> the invalid field is silently omitted from the upsert', async () => {
    mockAuthenticatedUser()
    const answers: QuizAnswer[] = [
      { questionId: 'shopping-behavior', optionId: 'fake-shopping-value' },
      { questionId: 'outfit-risk', optionId: 'safe-combinations' },
    ]

    await submitStyleQuiz(validVector, answers)

    const calls = rpcCalls
    expect(calls).toHaveLength(1)
    const payload = calls[0].payload

    // Invalid shopping behavior is omitted
    expect(payload.p_shopping_motivation).toBeNull()
    // Valid risk tolerance is still included
    expect(payload.p_risk_tolerance).toBe('safe-combinations')
  })
})
