import Link from 'next/link'
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
  const isDone = params?.done === 'true'

  if (isDone) {
    const pending = await getPendingOwnedSelection()
    if (pending.committed) redirect('/outfits')
    const collection = parseCatalogCollection(params.collection)
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

  return <StyleQuiz />
}
