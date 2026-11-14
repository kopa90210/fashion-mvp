'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Camera, Image as ImageIcon, Loader2, RefreshCw, AlertCircle, ChevronDown, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export const MAX_BYTES = 10 * 1024 * 1024 // 10 MB limit matching private-media validation
export const SUPPORTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const ACCEPT_STRING = SUPPORTED_TYPES.join(',')

export type ClientValidationResult = { ok: true } | { ok: false; message: string }

export function validateClientFile(file: File): ClientValidationResult {
  if (file.size === 0) {
    return { ok: false, message: 'The selected file is empty. Please choose a different photo.' }
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, message: 'Please choose an image under 10 MB (JPG, PNG, or WebP).' }
  }
  // If browser provided a MIME type, check it against supported types
  if (file.type && !SUPPORTED_TYPES.some((type) => type === file.type)) {
    return { ok: false, message: 'Please choose a JPG, PNG, or WebP photo.' }
  }
  // Check extension fallback if MIME type was blank or generic
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext && !['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    return { ok: false, message: 'Please choose a JPG, PNG, or WebP photo.' }
  }
  return { ok: true }
}

export default function PhotoUploadForm({
  onUpload,
  submitLabel = 'Find my pieces',
}: {
  onUpload: (file: File) => Promise<unknown>
  submitLabel?: string
}) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [isPending, startTransition] = useTransition()

  const libraryInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const previewUrlRef = useRef<string | null>(null)

  const clearPreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      clearPreviewUrl()
    }
  }, [clearPreviewUrl])

  const selectValidFile = useCallback(
    (newFile: File) => {
      setError(null)
      setStatusMessage(null)

      const validation = validateClientFile(newFile)
      if (!validation.ok) {
        setError(validation.message)
        return
      }

      clearPreviewUrl()
      const newUrl = URL.createObjectURL(newFile)
      previewUrlRef.current = newUrl
      setPreview(newUrl)
      setFile(newFile)
    },
    [clearPreviewUrl],
  )

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    // Reset input value so re-selecting the same file triggers onChange
    event.target.value = ''
    if (selected) {
      selectValidFile(selected)
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    if (!isPending) {
      setIsDragOver(true)
    }
  }

  function handleDragLeave(event: React.DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    setIsDragOver(false)
    if (isPending) return

    const dt = event.dataTransfer
    if (!dt) return

    if (dt.files && dt.files.length > 1) {
      setError('Please drop one photo at a time.')
      return
    }

    const droppedFile = dt.files?.[0]
    if (droppedFile) {
      selectValidFile(droppedFile)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file || isPending) return

    startTransition(async () => {
      setError(null)
      setStatusMessage(null)
      try {
        await onUpload(file)
        setStatusMessage('Photo uploaded')
      } catch {
        setError('Upload could not finish. Your photo was not processed. Please try again.')
      }
    })
  }

  function triggerLibrary() {
    libraryInputRef.current?.click()
  }

  function triggerCamera() {
    cameraInputRef.current?.click()
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      {/* Hidden file input for Photo Library */}
      <input
        ref={libraryInputRef}
        type="file"
        accept={ACCEPT_STRING}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {/* Hidden file input for Camera (hint: capture="environment") */}
      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPT_STRING}
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {preview && file ? (
        /* Selected-Photo State: Bounded preview, Change Photo, and primary action */
        <div className="flex flex-col space-y-4">
          <div className="overflow-hidden rounded-3xl border border-[#D8CEC2] bg-[#FFFDFA] p-4 shadow-xs sm:p-6">
            <div className="relative aspect-[4/5] max-h-[50vh] min-h-[260px] w-full overflow-hidden rounded-2xl bg-[#EBE3D8] sm:max-h-[520px]">
              <Image
                src={preview}
                alt="Selected outfit photo preview"
                fill
                unoptimized
                className="object-contain p-3 sm:p-5"
              />
            </div>

            {/* Change photo & file info control */}
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#D8CEC2]/60 pt-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-[#1D1B18]">{file.name}</p>
                <p className="text-xs text-[#6D6257]">
                  {(file.size / (1024 * 1024)).toFixed(1)} MB · Ready to discover pieces
                </p>
              </div>
              <button
                type="button"
                disabled={isPending}
                onClick={triggerLibrary}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[#6D6257] underline underline-offset-4 transition-colors hover:text-[#1D1B18] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2 disabled:opacity-50"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Change photo
              </button>
            </div>
          </div>

          {/* Accessible error feedback if upload fails */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
              <div className="flex-1 leading-snug">{error}</div>
            </div>
          )}

          {/* Accessible status feedback */}
          {statusMessage && (
            <p role="status" className="text-center text-sm font-medium text-[#6D6257]">
              {statusMessage}
            </p>
          )}

          {/* Primary Action Button */}
          <div className="pt-2">
            <Button
              type="submit"
              disabled={isPending}
              className="h-13 w-full rounded-full bg-[#1D1B18] text-base font-medium text-[#FFFDFA] shadow-xs transition-colors hover:bg-[#34312C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2 disabled:opacity-60"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 size-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                  Uploading your photo…
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </div>
      ) : (
        /* Empty / Entry State: Immediacy-first capture & selection card */
        <div className="flex flex-col space-y-4">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`relative flex min-h-[320px] flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition-colors sm:min-h-[380px] sm:p-10 ${
              isDragOver
                ? 'border-[#1D1B18] bg-[#EBE3D8]/80'
                : 'border-[#D8CEC2] bg-[#FFFDFA] hover:border-[#8E9B82]'
            }`}
          >
            {/* Subtle sage accent visual badge */}
            <div className="flex size-16 items-center justify-center rounded-full bg-[#E5E9E1] text-[#4A5D43] shadow-xs sm:size-20">
              <Camera className="size-8 text-[#3F5038]" aria-hidden="true" />
            </div>

            <h2 className="mt-4 text-xl font-medium tracking-tight text-[#1D1B18] sm:text-2xl">
              Snap or pick your outfit
            </h2>
            <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-[#6D6257]">
              Drag and drop an image here, snap a photo, or choose from your device gallery.
            </p>

            {/* Immediate Dual Action Buttons */}
            <div className="mt-6 flex w-full max-w-sm flex-col gap-3 sm:flex-row sm:gap-3">
              <Button
                type="button"
                disabled={isPending}
                onClick={triggerCamera}
                className="h-12 flex-1 rounded-full bg-[#1D1B18] px-5 text-sm font-medium text-[#FFFDFA] shadow-xs transition-colors hover:bg-[#34312C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2"
              >
                <Camera className="mr-2 size-4 text-[#E5E9E1]" aria-hidden="true" />
                Take a photo
              </Button>

              <Button
                type="button"
                variant="outline"
                disabled={isPending}
                onClick={triggerLibrary}
                className="h-12 flex-1 rounded-full border-[#D8CEC2] bg-[#FFFDFA] px-5 text-sm font-medium text-[#1D1B18] shadow-xs transition-colors hover:bg-[#F7F4EF] hover:border-[#8E9B82] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2"
              >
                <ImageIcon className="mr-2 size-4 text-[#6D6257]" aria-hidden="true" />
                Choose from gallery
              </Button>
            </div>

            <p className="mt-4 text-xs text-[#8C8276]">
              Supports JPG, PNG, or WebP up to 10 MB
            </p>
          </div>

          {/* Accessible error feedback */}
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50/70 p-4 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
              <div className="flex-1 leading-snug">{error}</div>
            </div>
          )}

          {/* Collapsible Photo tips section */}
          <details className="group rounded-2xl border border-[#D8CEC2] bg-[#FFFDFA] p-4 text-[#1D1B18] transition-colors">
            <summary className="flex min-h-6 cursor-pointer list-none items-center justify-between text-xs font-medium uppercase tracking-[0.16em] text-[#6D6257] [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-1.5 text-[#4A5D43]">
                <Sparkles className="size-3.5 text-[#8E9B82]" aria-hidden="true" />
                Photo tips
              </span>
              <ChevronDown className="size-4 text-[#6D6257] transition-transform duration-200 group-open:rotate-180" aria-hidden="true" />
            </summary>
            <ul className="mt-3 space-y-2 border-t border-[#D8CEC2]/50 pt-3 text-sm leading-relaxed text-[#1D1B18]">
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#8E9B82]" aria-hidden="true" />
                <span>Use a clear, well-lit photo where garments stand out.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#8E9B82]" aria-hidden="true" />
                <span>Keep the clothing you want visible without heavy occlusion.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#8E9B82]" aria-hidden="true" />
                <span>Avoid overlapping people where possible for cleaner piece separation.</span>
              </li>
              <li className="flex items-start gap-2.5 text-xs text-[#6D6257]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[#6D6257]" aria-hidden="true" />
                <span>Format: JPG, PNG, or WebP up to 10 MB.</span>
              </li>
            </ul>
          </details>
        </div>
      )}
    </form>
  )
}
