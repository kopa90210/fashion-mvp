'use server'

import { createClient } from '@/src/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { StyleVector } from '@/src/lib/quiz/scoring'
import { STYLE_DIMENSIONS } from '@/src/lib/quiz/scoring'

/**
 * Validate that a value looks like a proper style vector:
 * - All expected dimensions present
 * - Every value is a finite number in [0, 1]
 */
function isValidStyleVector(v: unknown): v is StyleVector {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const obj = v as Record<string, unknown>
  for (const dim of STYLE_DIMENSIONS) {
    const val = obj[dim]
    if (typeof val !== 'number' || !Number.isFinite(val)) return false
    if (val < 0 || val > 1) return false
  }
  return true
}

import { extractQuizMetadata, type QuizAnswer } from '@/src/lib/quiz/scoring'

const VALID_SHOPPING_MOTIVATIONS = new Set([
  'matches-wardrobe',
  'looks-unique',
  'quality-worth-it',
  'price-is-right',
])

const VALID_RISK_TOLERANCES = new Set([
  'safe-combinations',
  'sometimes-different',
  'love-experimenting',
  'depends-on-mood',
])

/**
 * Save quiz results and the next Fashion DNA version in one database operation.
 *
 * Called from the client after the quiz is completed and scored.
 */
export async function submitStyleQuiz(vector: StyleVector, answers: QuizAnswer[]) {
  const supabase = await createClient()

  // Auth gate
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) {
    redirect('/login')
  }

  // Older accounts may predate the auth sync trigger. Restore the profile row
  // before writing fashion_dna, whose foreign key references public.users.
  const { error: profileError } = await supabase
    .from('users')
    .upsert({ id: authData.user.id }, { onConflict: 'id' })

  if (profileError) {
    throw new Error(`Failed to initialize user profile: ${profileError.message}`)
  }

  // Validate input
  if (!isValidStyleVector(vector)) {
    throw new Error('Invalid style vector')
  }

  // Extract metadata safely server-side
  const { shoppingMotivation, riskTolerance } = extractQuizMetadata(answers)
  
  const { error } = await supabase.rpc('submit_style_quiz', {
    p_vector: vector,
    p_shopping_motivation: shoppingMotivation && VALID_SHOPPING_MOTIVATIONS.has(shoppingMotivation) ? shoppingMotivation : null,
    p_risk_tolerance: riskTolerance && VALID_RISK_TOLERANCES.has(riskTolerance) ? riskTolerance : null,
  })

  if (error) {
    throw new Error(`Failed to save style data: ${error.message}`)
  }

  redirect('/quiz?done=true')
}
