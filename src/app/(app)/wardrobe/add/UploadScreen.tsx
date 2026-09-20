'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { uploadDraftWardrobeItem, uploadOutfitPhoto } from '@/src/app/actions/wardrobe'
import PhotoUploadForm from './PhotoUploadForm'

export default function UploadScreen({ outfitUploadEnabled }: { outfitUploadEnabled: boolean }) {
  const router = useRouter()
  const [mode, setMode] = useState<'outfit' | 'piece'>(outfitUploadEnabled ? 'outfit' : 'piece')
  return <main className="min-h-screen bg-[#f7f4ef] px-4 py-7 text-[#1d1b18] sm:px-6"><div className="mx-auto max-w-xl">
    <button type="button" onClick={() => router.back()} aria-label="Go back" className="mb-10 flex size-10 items-center justify-center rounded-full border border-[#d8cec2] bg-white/60"><ArrowLeft className="size-4" /></button>
    <p className="text-sm uppercase tracking-[0.18em] text-[#7a6f62]">Add to closet</p>
    <h1 className="mt-2 text-3xl font-semibold">{mode === 'outfit' ? 'Upload an outfit photo' : 'Photograph a piece'}</h1>
    {outfitUploadEnabled && <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-[#ebe3d8] p-1" role="group" aria-label="Photo type">
      <button type="button" onClick={() => setMode('outfit')} className={`rounded-lg px-4 py-3 text-sm ${mode === 'outfit' ? 'bg-white font-semibold shadow-sm' : 'text-[#6d6257]'}`}>Full outfit</button>
      <button type="button" onClick={() => setMode('piece')} className={`rounded-lg px-4 py-3 text-sm ${mode === 'piece' ? 'bg-white font-semibold shadow-sm' : 'text-[#6d6257]'}`}>Single piece</button>
    </div>}
    <p className="mt-5 text-sm text-[#6d6257]">{mode === 'outfit' ? 'We’ll separate the visible garments into drafts for you to review. You choose what enters your closet.' : 'Add one clear garment photo to your drafts.'}</p>
    <div className="mt-6"><PhotoUploadForm key={mode} onUpload={async (file) => {
      if (mode === 'outfit') {
        const result = await uploadOutfitPhoto(file)
        router.push(`/wardrobe/add/review/${result.sourcePhotoId}`)
      } else {
        await uploadDraftWardrobeItem(file)
        router.push('/wardrobe')
      }
    }} submitLabel={mode === 'outfit' ? 'Separate garments' : 'Add to drafts'} /></div>
  </div></main>
}
