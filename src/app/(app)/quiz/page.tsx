import { createClient } from '@/src/lib/supabase/server'
import { redirect } from 'next/navigation'
import StyleQuiz from './StyleQuiz'
import PieceSelectionScreen from './PieceSelectionScreen'
import { getPendingOwnedSelection } from '@/src/app/actions/wardrobe'

export const metadata = {
  title: 'Style Quiz — AutoFashion',
  description: 'Discover your fashion DNA in 5 quick taps.',
}

export default async function QuizPage({
  searchParams,
}: {
  searchParams: Promise<{ done?: string }>
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect('/login')
  }

  const params = await searchParams
  const isDone = params?.done === 'true'

  if (isDone) {
    const pending = await getPendingOwnedSelection()
    if (pending.committed) redirect('/outfits')
    return <PieceSelectionScreen pending={pending} />
  }

  return <StyleQuiz />
}
