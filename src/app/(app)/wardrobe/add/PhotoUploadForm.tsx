'use client'

import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { Camera, Image as ImageIcon, Loader2, RefreshCw, Upload, AlertCircle } from 'lucide-react'
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
  submitLabel = 'Upload photo',
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
    <form onSubmit={handleSubmit} className="space-y-5">
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
        /* Preview state */
        <div className="overflow-hidden rounded-3xl border border-[#D8CEC2] bg-[#FFFDFA] p-5 shadow-xs sm:p-6">
          <div className="relative aspect-[4/5] max-h-[50vh] w-full overflow-hidden rounded-2xl bg-[#EBE3D8] sm:max-h-[460px]">
            <Image
              src={preview}
              alt="Selected outfit photo preview"
              fill
              unoptimized
              className="object-contain p-4"
            />
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[#D8CEC2]/60 pt-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[#1D1B18]">{file.name}</p>
              <p className="text-xs text-[#6D6257]">
                {(file.size / (1024 * 1024)).toFixed(1)} MB · Ready to find pieces
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

          <div className="mt-5">
            <Button
              type="submit"
              disabled={isPending}
              className="h-12 w-full rounded-full bg-[#1D1B18] text-base font-medium text-[#FFFDFA] shadow-xs transition-colors hover:bg-[#34312C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2 disabled:opacity-60"
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
        /* Empty / Dropzone state */
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`flex min-h-[300px] flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition-colors sm:p-10 ${
            isDragOver
              ? 'border-[#1D1B18] bg-[#EBE3D8]/70'
              : 'border-[#D8CEC2] bg-[#FFFDFA] hover:border-[#B9AA99]'
          }`}
        >
          <div className="flex size-14 items-center justify-center rounded-full bg-[#F7F4EF] text-[#6D6257]">
            <Upload className="size-6 text-[#1D1B18]" aria-hidden="true" />
          </div>

          <h2 className="mt-4 text-lg font-medium text-[#1D1B18]">Select your outfit photo</h2>
          <p className="mt-1 text-sm text-[#6D6257]">
            Drag and drop your image here, or choose from your device
          </p>
          <p className="mt-1 text-xs text-[#6D6257]">Supports JPG, PNG, or WebP up to 10 MB</p>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:gap-4">
            <Button
              type="button"
              disabled={isPending}
              onClick={triggerLibrary}
              className="h-12 rounded-full bg-[#1D1B18] px-6 text-sm font-medium text-[#FFFDFA] shadow-xs transition-colors hover:bg-[#34312C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2"
            >
              <ImageIcon className="mr-2 size-4" aria-hidden="true" />
              Choose a photo
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={triggerCamera}
              className="h-12 rounded-full border-[#D8CEC2] bg-[#FFFDFA] px-6 text-sm font-medium text-[#1D1B18] shadow-xs transition-colors hover:bg-[#F7F4EF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1D1B18] focus-visible:ring-offset-2"
            >
              <Camera className="mr-2 size-4 text-[#6D6257]" aria-hidden="true" />
              Take a photo
            </Button>
          </div>
        </div>
      )}

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

      {/* Accessible status feedback */}
      {statusMessage && (
        <p role="status" className="text-center text-sm font-medium text-[#6D6257]">
          {statusMessage}
        </p>
      )}
    </form>
  )
}
