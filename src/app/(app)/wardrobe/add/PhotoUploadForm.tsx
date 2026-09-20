'use client'

import { useEffect, useState, useTransition } from 'react'
import { Upload } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export default function PhotoUploadForm({ onUpload, submitLabel = 'Upload photo' }: { onUpload: (file: File) => Promise<unknown>; submitLabel?: string }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) return
    startTransition(async () => {
      setMessage(null)
      try {
        await onUpload(file)
        setMessage('Photo uploaded')
        setFile(null)
        setPreview(null)
      } catch {
        setMessage('Upload could not finish. Your photo was not added. Please try again.')
      }
    })
  }
  return <form onSubmit={submit} className="space-y-4">
    <label className="flex min-h-56 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed border-[#b9aa99] bg-white/55 p-6 text-center">
      {preview ? <Image src={preview} alt="Selected wardrobe photo preview" width={500} height={350} unoptimized className="max-h-72 w-full rounded-xl object-contain" /> : <><Upload className="size-8 text-[#7a6f62]" /><span className="mt-3 text-sm font-medium">Choose a photo</span><span className="mt-1 text-xs text-[#7a6f62]">JPG, PNG, or WebP, up to 10 MB.</span></>}
      <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(event) => {
        const selected = event.target.files?.[0] ?? null
        setFile(selected)
        setPreview(selected ? URL.createObjectURL(selected) : null)
      }} />
    </label>
    {file && <p className="text-sm text-[#6d6257]">{file.name}</p>}
    <Button type="submit" className="w-full" disabled={!file || isPending}>{isPending ? 'Uploading...' : submitLabel}</Button>
    {message && <p role="status" className="text-center text-sm font-medium">{message}</p>}
  </form>
}
