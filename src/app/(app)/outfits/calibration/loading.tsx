export default function CalibrationLoading() {
  return (
    <main className="px-4 py-6 text-[#1d1b18] sm:px-6 lg:py-10">
      <div className="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[minmax(0,7fr)_minmax(17rem,3fr)] lg:gap-10">
        <section aria-label="Loading style check" role="status" className="min-w-0">
          <div className="mb-8">
            <div className="h-3 w-24 animate-pulse rounded-full bg-[#ded5ca] motion-reduce:animate-none" />
            <div className="mt-4 h-10 w-72 max-w-[80%] animate-pulse rounded-xl bg-[#ded5ca] motion-reduce:animate-none" />
            <div className="mt-4 h-4 w-80 max-w-full animate-pulse rounded-full bg-[#e6ddd2] motion-reduce:animate-none" />
          </div>
          <div className="relative h-[clamp(28rem,68vw,42rem)] overflow-hidden rounded-[2rem] bg-[#ebe3d8]">
            <div className="absolute left-[30%] top-[8%] h-[44%] w-[40%] animate-pulse rounded-[2rem] bg-[#ded5ca]/70 motion-reduce:animate-none" />
            <div className="absolute bottom-[7%] left-[34%] h-[20%] w-[32%] animate-pulse rounded-[2rem] bg-[#ded5ca]/70 motion-reduce:animate-none" />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="h-14 animate-pulse rounded-full bg-[#e6ddd2] motion-reduce:animate-none" />
            <div className="h-14 animate-pulse rounded-full bg-[#d1c6b9] motion-reduce:animate-none" />
          </div>
          <span className="sr-only">Loading your next style-check look.</span>
        </section>
        <aside aria-hidden="true" className="hidden self-start rounded-3xl border border-[#d8cec2] bg-[#fffdfa]/65 p-6 lg:block lg:pt-28">
          <div className="h-4 w-36 animate-pulse rounded-full bg-[#ded5ca] motion-reduce:animate-none" />
          <div className="mt-5 space-y-5">
            <div className="h-2 rounded-full bg-[#e6ddd2]" />
            <div className="h-2 w-4/5 rounded-full bg-[#e6ddd2]" />
            <div className="h-2 w-3/5 rounded-full bg-[#e6ddd2]" />
          </div>
        </aside>
      </div>
    </main>
  )
}
