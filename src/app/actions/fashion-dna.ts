'use server'

import { createClient } from '@/src/lib/supabase/server'
import type { DnaSignal } from '@/src/lib/fashion-dna/types'
import { vectorToSignals } from '@/src/lib/fashion-dna/labels'

/**
 * Fetch the calling user's Fashion DNA vector from the database,
 * map it through the label dictionary, and return the top-N signals
 * sorted by weight descending.
 *
 * This is the single server-side entry point that turns raw vector
 * data into display-ready DnaSignal[]. Screens never touch
 * fashion_dna.vector directly — they receive DnaSignal[] only.
 *
 * Also returns the user's total feedback count so the UI can show
 * a "still learning" caption for early-stage users.
 */
export async function getFashionDnaSummary(
  topN = 4,
): Promise<{ signals: DnaSignal[]; feedbackCount: number }> {
  const supabase = await createClient()

  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    throw new Error('Not authenticated')
  }

  const userId = userData.user.id

  const [dnaResult, feedbackResult] = await Promise.all([
    supabase
      .from('fashion_dna')
      .select('vector')
      .eq('user_id', userId)
      .single(),
    supabase
      .from('feedback')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
  ])

  if (dnaResult.error || !dnaResult.data) {
    throw new Error('Fashion DNA not found')
  }

  if (feedbackResult.error) {
    console.error('feedback count error:', feedbackResult.error)
  }

  const vector = (dnaResult.data.vector ?? {}) as Record<string, number>

  return {
    signals: vectorToSignals(vector, topN),
    feedbackCount: feedbackResult.count ?? 0,
  }
}
