'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { uploadOutfitPhoto } from '@/src/app/actions/wardrobe'
import PhotoUploadForm from './PhotoUploadForm'

export default function UploadScreen() {
  const router = useRouter()
  return (
    <main className="px-4 py-7 text-[#1D1B18] sm:px-6">
      <div className="mx-auto max-w-xl">
        <button
          type="button"
          onClick={() => router.back()}
          aria-label="Go back"
          className="mb-8 flex size-11 items-center justify-center rounded-full border border-[#D8CEC2] bg-[#FFFDFA] text-[#1D1B18] transition-colors hover:bg-[#F7F4EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2"
        >
          <ArrowLeft className="size-5" />
        </button>

        <p className="text-xs uppercase tracking-[0.2em] text-[#6D6257]">Add to closet</p>
        <h1 className="mt-2 text-3xl font-medium tracking-tight sm:text-4xl">Turn a photo into wardrobe pieces.</h1>
        <p className="mt-3 text-base text-[#6D6257]">Upload an outfit photo, then choose which pieces to keep.</p>

        <section aria-label="Photo guidelines" className="mt-6 rounded-2xl border border-[#D8CEC2] bg-[#FFFDFA] p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#6D6257]">For best results</p>
          <ul className="mt-3 space-y-2 text-sm leading-relaxed text-[#1D1B18]">
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#6D6257]" aria-hidden="true" />
              <span>Use a clear, well-lit photo.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#6D6257]" aria-hidden="true" />
              <span>Keep the clothing you want visible.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#6D6257]" aria-hidden="true" />
              <span>Avoid overlapping people where possible.</span>
            </li>
          </ul>
        </section>

        <div className="mt-8">
          <PhotoUploadForm
            onUpload={async (file) => {
              const result = await uploadOutfitPhoto(file)
              router.push(`/wardrobe/add/review/${result.sourcePhotoId}`)
            }}
            submitLabel="Find my pieces"
          />
        </div>
      </div>
    </main>
  )
}
