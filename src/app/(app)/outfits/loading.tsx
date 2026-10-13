import { Skeleton } from '@/components/ui/skeleton'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export default function LoadingOutfits() {
  return (
    <main className="px-4 py-6 text-[#1d1b18] sm:px-6 lg:py-10">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="min-w-0 space-y-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-4 w-28 bg-[#e4dbd0]" />
              <Skeleton className="h-9 w-64 bg-[#e4dbd0]" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full bg-[#e4dbd0]" />
          </div>

          <Card className="rounded-lg border-[#d8cec2] bg-white/70 shadow-sm">
            <CardHeader className="gap-2">
              <Skeleton className="h-6 w-40 bg-[#e4dbd0]" />
              <Skeleton className="h-4 w-72 bg-[#e4dbd0]" />
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="overflow-hidden rounded-lg border border-[#ded5ca] bg-[#fbfaf7]">
                    <Skeleton className="aspect-[4/5] w-full rounded-none bg-[#e8e0d5]" />
                    <div className="min-h-20 space-y-2 p-3">
                      <Skeleton className="h-4 w-16 bg-[#e4dbd0]" />
                      <Skeleton className="h-4 w-full bg-[#e4dbd0]" />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between border-t border-[#e4dbd0] pt-4">
                <Skeleton className="h-4 w-48 bg-[#e4dbd0]" />
                <div className="flex gap-2">
                  <Skeleton className="h-10 w-10 rounded-lg bg-[#e4dbd0]" />
                  <Skeleton className="h-10 w-10 rounded-lg bg-[#e4dbd0]" />
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        <aside className="lg:pt-[88px]">
          <Card className="rounded-lg border-[#d8cec2] bg-white/70 shadow-sm">
            <CardHeader>
              <Skeleton className="h-6 w-32 bg-[#e4dbd0]" />
              <Skeleton className="h-4 w-48 bg-[#e4dbd0]" />
            </CardHeader>
            <CardContent className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20 bg-[#e4dbd0]" />
                    <Skeleton className="h-4 w-8 bg-[#e4dbd0]" />
                  </div>
                  <Skeleton className="h-2 w-full rounded-full bg-[#e4dbd0]" />
                </div>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  )
}
