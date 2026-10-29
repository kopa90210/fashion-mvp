import { redirect } from 'next/navigation'
import { createClient } from '@/src/lib/supabase/server'
import {
  getProfileSummary,
  getSavedLooks,
  getWornLooksHistory,
} from '@/src/app/actions/profile'
import ProfileStudioClient from './ProfileStudioClient'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: authData, error: authError } = await supabase.auth.getUser()

  if (authError || !authData?.user) {
    redirect('/login')
  }

  // Concurrently fetch profile summary, saved looks, and worn history with resilience
  const [summaryResult, initialSavedResult, initialWornResult] = await Promise.allSettled([
    getProfileSummary(),
    getSavedLooks(undefined, 8),
    getWornLooksHistory(undefined, 8),
  ])

  const initialSaved =
    initialSavedResult.status === 'fulfilled'
      ? initialSavedResult.value
      : { items: [], nextCursor: null, hasMore: false }

  const initialWorn =
    initialWornResult.status === 'fulfilled'
      ? initialWornResult.value
      : { items: [], nextCursor: null, hasMore: false }

  const summary =
    summaryResult.status === 'fulfilled'
      ? summaryResult.value
      : {
          account: {
            id: authData.user.id,
            email: authData.user.email ?? null,
            displayName: 'Member',
            initials: 'M',
          },
          counts: {
            wardrobePieces: null,
            savedLooks: null,
            timesWorn: null,
          },
          passport: {
            topStyles: [],
            quizSignals: null,
            hasStyleData: false,
            caption: 'Based on your style choices.',
          },
          signatureLook: null,
        }

  return (
    <ProfileStudioClient
      account={summary.account}
      counts={summary.counts}
      passport={summary.passport}
      initialSaved={initialSaved}
      initialWorn={initialWorn}
    />
  )
}
