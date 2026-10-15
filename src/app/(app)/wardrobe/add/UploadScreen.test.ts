import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  uploadOutfitPhoto: vi.fn(),
  uploadDraftWardrobeItem: vi.fn(),
  onUpload: undefined as ((file: File) => Promise<unknown>) | undefined,
  submitLabel: '',
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
}))

vi.mock('@/src/app/actions/wardrobe', () => ({
  uploadOutfitPhoto: mocks.uploadOutfitPhoto,
  uploadDraftWardrobeItem: mocks.uploadDraftWardrobeItem,
}))

vi.mock('./PhotoUploadForm', () => ({
  default: ({ onUpload, submitLabel }: { onUpload: (file: File) => Promise<unknown>; submitLabel?: string }) => {
    mocks.onUpload = onUpload
    mocks.submitLabel = submitLabel ?? ''
    return React.createElement('button', null, submitLabel)
  },
}))

import UploadScreen from './UploadScreen'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.onUpload = undefined
  mocks.submitLabel = ''
})

describe('unified wardrobe upload', () => {
  it('shows one multi-garment upload path with unified copy', () => {
    const html = renderToStaticMarkup(React.createElement(UploadScreen))

    expect(html).toContain('Add to closet')
    expect(html).toContain('Upload your clothes')
    expect(html).toContain('Upload one photo. We’ll find the visible pieces and prepare them for you to review.')
    expect(html).toContain('You choose what gets added to your wardrobe.')
    expect(mocks.submitLabel).toBe('Find my pieces')
    expect(html).not.toContain('Full outfit')
    expect(html).not.toContain('Single piece')
    expect(html).not.toContain('Separate garments')
    expect(html).not.toContain('Add to drafts')
  })

  it('queues the outfit photo and routes to its review screen', async () => {
    mocks.uploadOutfitPhoto.mockResolvedValue({ sourcePhotoId: 'photo-123', jobId: 'job-123' })
    renderToStaticMarkup(React.createElement(UploadScreen))
    const file = new File(['photo'], 'closet.jpg', { type: 'image/jpeg' })

    await expect(mocks.onUpload?.(file)).resolves.toBeUndefined()

    expect(mocks.uploadOutfitPhoto).toHaveBeenCalledWith(file)
    expect(mocks.push).toHaveBeenCalledWith('/wardrobe/add/review/photo-123')
    expect(mocks.uploadDraftWardrobeItem).not.toHaveBeenCalled()
  })
})
