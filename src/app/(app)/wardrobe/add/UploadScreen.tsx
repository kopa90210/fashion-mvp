'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { uploadOutfitPhoto } from '@/src/app/actions/wardrobe'
import PhotoUploadForm from './PhotoUploadForm'

export default function UploadScreen() {
  const router = useRouter()
  return (
    <main className="stylegraph-upload-surface min-h-dvh bg-[#F7F4EF] px-4 py-5 text-[#1D1B18] sm:px-6 sm:py-8">
      <div className="mx-auto max-w-xl">
        {/* Navigation header: Back button */}
        <header className="mb-6 flex items-center justify-between sm:mb-8">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Go back"
            className="flex size-11 items-center justify-center rounded-full border border-[#D8CEC2] bg-[#FFFDFA] text-[#1D1B18] transition-colors hover:bg-[#EBE3D8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F7F4EF]"
          >
            <ArrowLeft className="size-5" />
          </button>
        </header>

        {/* Immediate, concise header */}
        <div className="mb-6 sm:mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-[#6D6257]">Add to closet</p>
          <h1 className="mt-1.5 text-3xl font-medium tracking-tight sm:text-4xl">Add your look</h1>
          <p className="mt-2 text-base text-[#6D6257]">One photo. Discover your wardrobe pieces.</p>
        </div>

        {/* Photo Selection and Preview Form */}
        <div>
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
