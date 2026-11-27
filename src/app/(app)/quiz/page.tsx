import Link from 'next/link'
import {cookies} from 'next/headers'
import {draftKey,parseDraft} from '@/src/lib/quiz/progress'
import {readQuizSignals} from '@/src/lib/quiz/scoring'
import { CATALOG_COLLECTIONS, catalogSelectionHref, parseCatalogCollection } from '@/src/lib/quiz/catalog-collection'
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
  searchParams: Promise<{ done?: string; collection?: string | string[] }>
}) {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    redirect('/login')
  }

  const params = await searchParams
  const raw=(await cookies()).get(draftKey(data.user.id))?.value
  const browserDraft=parseDraft(raw)
  const {data:dna,error:dnaError}=await supabase.from('fashion_dna').select('quiz_signals').eq('user_id',data.user.id).maybeSingle()
  if(dnaError)throw new Error('Could not load quiz progress')
  const pending=await getPendingOwnedSelection()
  if(pending.committed)redirect('/outfits')
  const isDone = Boolean(readQuizSignals(dna?.quiz_signals))
  const {data:accountDraft,error:draftError}=await supabase.from('style_quiz_drafts').select('draft,version').eq('user_id',data.user.id).maybeSingle()
  if(draftError)throw new Error('Could not load account quiz progress')
  const draft=accountDraft?parseDraft(JSON.stringify(accountDraft.draft)):browserDraft
  const draftVersion=accountDraft?.version??0

  if (isDone) {
    const collection = parseCatalogCollection(params.collection)??draft?.imageSet
    if (!collection) {
      return (
        <main className="stylegraph-quiz-surface flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-[#141416] px-6 text-center text-[#F5F1E9]">
          <h1 className="text-3xl font-medium">Choose a collection</h1>
          <p className="text-[#B5B0A8]">Browse examples of pieces like the ones you own.</p>
          <div className="flex flex-wrap justify-center gap-3">
            {CATALOG_COLLECTIONS.map(({ id, label }) => (
              <Link key={id} href={catalogSelectionHref(id)} className="inline-flex min-h-11 items-center rounded-full border border-[#E8C568] px-5 text-sm focus-visible:outline-2 focus-visible:outline-offset-4">
                {label}
              </Link>
            ))}
          </div>
        </main>
      )
    }
    return <PieceSelectionScreen key={collection} pending={pending} collection={collection} />
  }

  return <StyleQuiz userId={data.user.id} initialDraft={draft} initialVersion={draftVersion}/>
}
