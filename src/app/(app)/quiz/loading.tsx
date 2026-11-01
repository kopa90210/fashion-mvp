export default function LoadingQuiz() {
  return (
    <div className="stylegraph-quiz-surface relative flex min-h-[100dvh] w-full flex-col items-center bg-[#141416] px-4 pt-8 pb-16 text-[#F5F1E9] sm:px-6">
      <div className="flex w-full max-w-lg flex-col items-center">
        {/* Step indicator skeleton */}
        <div className="mt-8 mb-4 flex items-center gap-2 sm:mt-10" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full ${i === 0 ? 'w-7 bg-[#E8C568]' : 'w-3.5 bg-[#38383D]'}`}
            />
          ))}
        </div>

        {/* Heading skeleton */}
        <div className="mt-2 mb-6 h-8 w-64 rounded-lg bg-[#1E1E21] sm:mb-8 sm:h-9 sm:w-80" />

        {/* 2x2 grid skeleton */}
        <div className="grid w-full grid-cols-2 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex w-full flex-col rounded-2xl border border-[#38383D] bg-[#1E1E21] p-2 shadow-xs sm:p-2.5"
            >
              <div className="aspect-[4/5] w-full animate-pulse rounded-xl bg-[#141416]" />
              <div className="flex min-h-[2.5rem] w-full items-center px-1 pt-2 pb-0.5 sm:pt-2.5">
                <div className="h-3.5 w-3/4 rounded bg-[#38383D]" />
              </div>
            </div>
          ))}
        </div>

        {/* Counter skeleton */}
        <div className="mt-6 h-4 w-28 rounded bg-[#38383D]" />
      </div>
    </div>
  )
}
