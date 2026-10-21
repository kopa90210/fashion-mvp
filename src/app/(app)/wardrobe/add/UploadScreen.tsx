'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { uploadOutfitPhoto } from '@/src/app/actions/wardrobe'
import PhotoUploadForm from './PhotoUploadForm'

export default function UploadScreen() {
  const router = useRouter()
  return <main className="px-4 py-7 text-[#1D1B18] sm:px-6"><div className="mx-auto max-w-xl">
    <button type="button" onClick={() => router.back()} aria-label="Go back" className="mb-10 flex size-10 items-center justify-center rounded-full border border-[#D8CEC2] bg-[#FFFDFA]/60"><ArrowLeft className="size-4" /></button>
    <p className="text-sm uppercase tracking-[0.18em] text-[#6D6257]">Add to closet</p>
    <h1 className="mt-2 text-3xl font-semibold">Upload your clothes</h1>
    <p className="mt-5 text-sm text-[#6D6257]">Upload one photo. We’ll find the visible pieces and prepare them for you to review.</p>
    <p className="mt-2 text-sm text-[#6D6257]">You choose what gets added to your wardrobe.</p>
    <div className="mt-6"><PhotoUploadForm onUpload={async (file) => {
      const result = await uploadOutfitPhoto(file)
      router.push(`/wardrobe/add/review/${result.sourcePhotoId}`)
    }} submitLabel="Find my pieces" /></div>
  </div></main>
}
