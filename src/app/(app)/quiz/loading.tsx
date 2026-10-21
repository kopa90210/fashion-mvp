import { Skeleton } from '@/components/ui/skeleton'

export default function LoadingQuiz() {
  return (
    <div className="stylegraph-quiz-surface pb-32 pt-12 text-white px-4 sm:px-6 md:px-8">
      <div className="mx-auto max-w-4xl space-y-12">
        <div className="text-center space-y-3 flex flex-col items-center">
          <Skeleton className="h-9 w-80 bg-white/10" />
          <Skeleton className="h-4 w-96 bg-white/10" />
        </div>

        {Array.from({ length: 3 }).map((_, catIdx) => (
          <div key={catIdx} className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <Skeleton className="h-6 w-32 bg-white/10" />
              <Skeleton className="h-5 w-24 rounded-full bg-white/10" />
            </div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-xl border border-white/10 bg-white/5 p-3 space-y-3">
                  <Skeleton className="aspect-square w-full rounded-lg bg-white/10" />
                  <Skeleton className="h-4 w-3/4 bg-white/10" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
