'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import Image from 'next/image'
import {
  LogOut,
  ChevronDown,
  Loader2,
  Camera,
  Contact,
  Trash2,
} from 'lucide-react'
import type { ProfileAccount, ProfileStylePassport } from '@/src/lib/profile/types'
import {
  signOutAction,
  uploadAvatarAction,
  removeAvatarAction,
} from '@/src/app/actions/profile'
import StylePassportDialog from './StylePassportDialog'

interface ProfileAccountMenuProps {
  account: ProfileAccount
  passport?: ProfileStylePassport
  avatarUrl?: string | null
  onOpenPhotoPicker?: () => void
  onAvatarUpdated?: (url: string | null) => void
}

export default function ProfileAccountMenu({
  account,
  passport,
  avatarUrl: propAvatarUrl,
  onOpenPhotoPicker,
  onAvatarUpdated,
}: ProfileAccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPassportOpen, setIsPassportOpen] = useState(false)
  const [isSigningOut, startSignOutTransition] = useTransition()

  // Local avatar state fallback if not controlled from parent
  const [localAvatarUrl, setLocalAvatarUrl] = useState<string | null | undefined>(undefined)
  const currentAvatarSrc =
    propAvatarUrl !== undefined
      ? propAvatarUrl
      : localAvatarUrl !== undefined
        ? localAvatarUrl
        : (account.avatarUrl ?? null)

  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [imageError, setImageError] = useState(false)

  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Clean up temporary preview URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  // Close when clicking outside with strict Node null check
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        menuRef.current &&
        event.target &&
        event.target instanceof Node &&
        !menuRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [isOpen])

  // Close on Escape key and return focus to toggle button
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [isOpen])

  function handleTriggerEditPhoto() {
    setIsOpen(false)
    if (onOpenPhotoPicker) {
      onOpenPhotoPicker()
    } else {
      fileInputRef.current?.click()
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setAvatarError(null)

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
        setLocalAvatarUrl(res.avatarUrl)
        onAvatarUpdated?.(res.avatarUrl)
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

  async function handleRemovePhoto() {
    setAvatarError(null)
    setIsUploading(true)
    try {
      const res = await removeAvatarAction()
      if (res.success) {
        setLocalAvatarUrl(null)
        onAvatarUpdated?.(null)
        setImageError(false)
      }
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Could not remove photo')
    } finally {
      setIsUploading(false)
    }
  }

  function handleSignOut() {
    startSignOutTransition(async () => {
      await signOutAction()
    })
  }

  const effectiveAvatar = previewUrl || currentAvatarSrc
  const hasCustomPhoto = Boolean(effectiveAvatar)

  return (
    <div ref={menuRef} className="relative inline-block text-left">
      {/* Hidden file input for standalone fallback */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        aria-label="Upload profile photo"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Account Pill Trigger */}
      <button
        ref={buttonRef}
        type="button"
        id="profile-account-menu-button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label={`Account menu for ${account.displayName}`}
        onClick={() => setIsOpen((prev) => !prev)}
        className="group flex min-h-10 items-center gap-2 rounded-full border border-[#D8CEC2] bg-[#FFFDFA] py-1 pl-1.5 pr-3 text-xs font-medium text-[#1D1B18] shadow-2xs transition-colors hover:bg-[#EBE3D8]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D1B18]"
      >
        <span
          aria-hidden="true"
          className="relative flex size-7 shrink-0 overflow-hidden rounded-full bg-[#9FAFA1] text-xs font-semibold text-[#1D1B18]"
        >
          {effectiveAvatar && !imageError ? (
            <Image
              src={effectiveAvatar}
              alt=""
              width={28}
              height={28}
              unoptimized
              className="size-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="flex size-full items-center justify-center font-medium">
              {account.initials}
            </span>
          )}
        </span>
        <span className="max-w-[120px] truncate text-xs font-medium sm:max-w-[160px]">
          {account.displayName}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-3.5 text-[#6D6257] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown Popup matching screenshot */}
      <div
        role="menu"
        aria-orientation="vertical"
        aria-labelledby="profile-account-menu-button"
        className={`absolute right-0 z-50 mt-2 w-52 origin-top-right rounded-2xl border border-[#D8CEC2] bg-[#FFFDFA] p-1.5 text-xs text-[#1D1B18] shadow-xl transition-all focus:outline-hidden ${
          isOpen ? 'block' : 'hidden'
        }`}
      >
        {/* Edit profile photo */}
        <button
          type="button"
          role="menuitem"
          disabled={isUploading}
          onClick={handleTriggerEditPhoto}
          className="flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#1D1B18] transition-colors hover:bg-[#EBE3D8]/50 focus-visible:outline-2 focus-visible:outline-[#1D1B18] disabled:opacity-50"
        >
          <Camera aria-hidden="true" className="size-4 text-[#1D1B18]" />
          <span>Edit profile photo</span>
        </button>

        {/* Style Passport */}
        {passport && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setIsOpen(false)
              setIsPassportOpen(true)
            }}
            className="flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#1D1B18] transition-colors hover:bg-[#EBE3D8]/50 focus-visible:outline-2 focus-visible:outline-[#1D1B18]"
          >
            <Contact aria-hidden="true" className="size-4 text-[#1D1B18]" />
            <span>Style Passport</span>
          </button>
        )}

        {/* Optional Remove photo if custom photo exists */}
        {hasCustomPhoto && (
          <button
            type="button"
            role="menuitem"
            disabled={isUploading}
            onClick={handleRemovePhoto}
            className="flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600 disabled:opacity-50"
          >
            <Trash2 aria-hidden="true" className="size-4 text-red-600" />
            <span>Remove photo</span>
          </button>
        )}

        <div className="my-1 border-t border-[#EAE3DA]" />

        {/* Sign out */}
        <button
          type="button"
          role="menuitem"
          disabled={isSigningOut}
          onClick={handleSignOut}
          className="flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-xs font-medium text-[#1D1B18] transition-colors hover:bg-[#EBE3D8]/50 focus-visible:outline-2 focus-visible:outline-[#1D1B18] disabled:opacity-50"
        >
          {isSigningOut ? (
            <Loader2 aria-hidden="true" className="size-4 animate-spin text-[#1D1B18]" />
          ) : (
            <LogOut aria-hidden="true" className="size-4 text-[#1D1B18]" />
          )}
          <span>{isSigningOut ? 'Signing out…' : 'Sign out'}</span>
        </button>
      </div>

      {avatarError && (
        <div role="alert" className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-red-200 bg-red-50 p-2 text-[11px] text-red-700 shadow-md">
          {avatarError}
        </div>
      )}

      {/* Style Passport Modal */}
      {passport && isPassportOpen && (
        <StylePassportDialog
          isOpen={isPassportOpen}
          passport={passport}
          onClose={() => {
            setIsPassportOpen(false)
            buttonRef.current?.focus()
          }}
        />
      )}
    </div>
  )
}
