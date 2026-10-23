'use server'

import { createClient } from '@/src/lib/supabase/server'
import { redirect } from 'next/navigation'
import { QUIZ_QUESTIONS_FOR_SCORING } from '@/src/lib/quiz/questions'
import { computeStyleVector, parseQuizSignals, type QuizAnswer } from '@/src/lib/quiz/scoring'

/** Persist one server-derived quiz result and Fashion DNA version. */
export async function submitStyleQuiz(answers: QuizAnswer[]) {
  const signals = parseQuizSignals(answers, QUIZ_QUESTIONS_FOR_SCORING)
  const vector = computeStyleVector(answers, QUIZ_QUESTIONS_FOR_SCORING)
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()
  if (authError || !authData?.user) redirect('/login')

  // Older accounts may predate the auth sync trigger.
  const { error: profileError } = await supabase.from('users')
    .upsert({ id: authData.user.id }, { onConflict: 'id' })
  if (profileError) throw new Error(`Failed to initialize user profile: ${profileError.message}`)

  const { error } = await supabase.rpc('submit_style_quiz', {
    p_vector: vector,
    p_shopping_motivation: null,
    p_risk_tolerance: null,
    p_quiz_signals: signals,
  })
  if (error) throw new Error(`Failed to save style data: ${error.message}`)
  redirect('/quiz?done=true')
}
