'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { Camera, Loader2 } from 'lucide-react'
import type {
  ProfileAccount,
  ProfileCounts,
  ProfileStylePassport,
} from '@/src/lib/profile/types'
import { uploadAvatarAction } from '@/src/app/actions/profile'
import ProfileAccountMenu from './ProfileAccountMenu'

interface ProfileHeaderProps {
  account: ProfileAccount
  counts?: ProfileCounts
  passport?: ProfileStylePassport
  // Backward compatibility with previous caller signatures if passed
  onToggleAppearance?: () => void
  isAppearanceOpen?: boolean
}

export default function ProfileHeader({
  account,
  passport,
}: ProfileHeaderProps) {
  const [overrideAvatarUrl, setOverrideAvatarUrl] = useState<string | null | undefined>(undefined)
  const currentAvatarUrl =
    overrideAvatarUrl !== undefined ? overrideAvatarUrl : (account.avatarUrl ?? null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [imageError, setImageError] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clean up temporary preview URLs
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setAvatarError(null)

    // Pre-flight file size check (10 MB limit)
    if (file.size > 10 * 1024 * 1024) {
      setAvatarError('Photo exceeds 10 MB limit')
      return
    }

    const tempPreview = URL.createObjectURL(file)
    setPreviewUrl(tempPreview)
    setImageError(false)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('avatar', file)
      const res = await uploadAvatarAction(formData)
      if (res.success && res.avatarUrl) {
        setOverrideAvatarUrl(res.avatarUrl)
      }
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not upload photo')
    } finally {
      setIsUploading(false)
      URL.revokeObjectURL(tempPreview)
      setPreviewUrl(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const effectiveAvatar = previewUrl || currentAvatarUrl

  return (
    <header className="mb-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        aria-label="Upload profile photo"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Top Bar: Title on left, Account Pill on right */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1D1B18] sm:text-3xl">
          My Style
        </h1>

        <div className="flex shrink-0 items-center">
          <ProfileAccountMenu
            account={account}
            passport={passport}
            avatarUrl={effectiveAvatar}
            onOpenPhotoPicker={() => fileInputRef.current?.click()}
            onAvatarUpdated={(url) => setOverrideAvatarUrl(url)}
          />
        </div>
      </div>

      {/* Hero Profile Row: Large Avatar + Name + Add/Change Photo */}
      <div className="mt-7 flex items-center gap-4">
        {/* Large circular avatar with camera overlay */}
        <div className="relative shrink-0">
          <div className="relative flex size-18 sm:size-20 shrink-0 overflow-hidden rounded-full bg-[#9FAFA1] text-2xl font-semibold text-[#1D1B18]">
            {effectiveAvatar && !imageError ? (
              <Image
                src={effectiveAvatar}
                alt={account.displayName}
                width={80}
                height={80}
                unoptimized
                className="size-full object-cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <span className="flex size-full items-center justify-center font-medium">
                {account.initials}
              </span>
            )}

            {isUploading && (
              <div
                aria-label="Uploading avatar"
                className="absolute inset-0 flex items-center justify-center bg-black/40 text-[#FFFDFA]"
              >
                <Loader2 className="size-5 animate-spin" />
              </div>
            )}
          </div>

          {/* Camera overlay badge button */}
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Edit profile photo"
            className="absolute -bottom-1 -right-1 flex size-7 sm:size-8 items-center justify-center rounded-full border border-[#D8CEC2] bg-[#FFFDFA] text-[#1D1B18] shadow-xs transition-colors hover:bg-[#EBE3D8]/60 focus-visible:outline-2 focus-visible:outline-[#1D1B18] disabled:opacity-50"
          >
            <Camera className="size-3.5 sm:size-4 text-[#1D1B18]" />
          </button>
        </div>

        {/* Display name & Add/Change photo link */}
        <div className="min-w-0">
          <h2 className="truncate text-base sm:text-lg font-semibold text-[#1D1B18]">
            {account.displayName}
          </h2>

          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="mt-0.5 block text-xs sm:text-sm text-[#6D6257] transition-colors hover:text-[#1D1B18] disabled:opacity-50"
          >
            {isUploading
              ? 'Uploading…'
              : effectiveAvatar
                ? 'Change profile photo'
                : 'Add profile photo'}
          </button>

          {avatarError && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {avatarError}
            </p>
          )}
        </div>
      </div>
    </header>
  )
}
