import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  onUpload: vi.fn(),
  urlsCreated: [] as string[],
  urlsRevoked: [] as string[],
  tasks: [] as Promise<void>[],
}))

// Mock URL methods for node environment
globalThis.URL.createObjectURL = (file: Blob | MediaSource) => {
  const url = `blob:mock-file-${(file as File).name}`
  mocks.urlsCreated.push(url)
  return url
}
globalThis.URL.revokeObjectURL = (url: string) => {
  mocks.urlsRevoked.push(url)
}

vi.mock('next/image', () => ({
  default: ({ src, alt, className, unoptimized }: React.ComponentProps<'img'> & { unoptimized?: boolean }) =>
    React.createElement('img', { src, alt, className, 'data-unoptimized': unoptimized }),
}))

import PhotoUploadForm, { validateClientFile, MAX_BYTES } from './PhotoUploadForm'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.urlsCreated.length = 0
  mocks.urlsRevoked.length = 0
  mocks.tasks.length = 0
})

describe('validateClientFile', () => {
  it('accepts valid JPEG, PNG, and WebP files under 10 MB', () => {
    const validJpg = new File(['image-bytes'], 'outfit.jpg', { type: 'image/jpeg' })
    const validPng = new File(['image-bytes'], 'outfit.png', { type: 'image/png' })
    const validWebp = new File(['image-bytes'], 'outfit.webp', { type: 'image/webp' })

    expect(validateClientFile(validJpg)).toEqual({ ok: true })
    expect(validateClientFile(validPng)).toEqual({ ok: true })
    expect(validateClientFile(validWebp)).toEqual({ ok: true })
  })

  it('rejects empty files with an accessible error', () => {
    const emptyFile = new File([], 'empty.jpg', { type: 'image/jpeg' })
    const result = validateClientFile(emptyFile)

    expect(result).toEqual({
      ok: false,
      message: 'The selected file is empty. Please choose a different photo.',
    })
  })

  it('rejects files larger than 10 MB with size guidance', () => {
    const largeFile = new File(['a'], 'giant.jpg', { type: 'image/jpeg' })
    Object.defineProperty(largeFile, 'size', { value: MAX_BYTES + 1 })

    const result = validateClientFile(largeFile)
    expect(result).toEqual({
      ok: false,
      message: 'Please choose an image under 10 MB (JPG, PNG, or WebP).',
    })
  })

  it('rejects unsupported MIME types and file extensions', () => {
    const pdfFile = new File(['data'], 'document.pdf', { type: 'application/pdf' })
    const gifFile = new File(['data'], 'animation.gif', { type: 'image/gif' })
    const txtFile = new File(['data'], 'notes.txt', { type: 'text/plain' })

    expect(validateClientFile(pdfFile)).toEqual({
      ok: false,
      message: 'Please choose a JPG, PNG, or WebP photo.',
    })
    expect(validateClientFile(gifFile)).toEqual({
      ok: false,
      message: 'Please choose a JPG, PNG, or WebP photo.',
    })
    expect(validateClientFile(txtFile)).toEqual({
      ok: false,
      message: 'Please choose a JPG, PNG, or WebP photo.',
    })
  })
})

describe('PhotoUploadForm', () => {
  it('renders initial empty selection state with primary and mobile camera options', () => {
    const html = renderToStaticMarkup(
      React.createElement(PhotoUploadForm, {
        onUpload: mocks.onUpload,
        submitLabel: 'Find my pieces',
      }),
    )

    expect(html).toContain('Select your outfit photo')
    expect(html).toContain('Drag and drop your image here, or choose from your device')
    expect(html).toContain('Supports JPG, PNG, or WebP up to 10 MB')
    expect(html).toContain('Choose a photo')
    expect(html).toContain('Take a photo')
    // Inputs: one standard library picker, one camera hint
    expect(html).toContain('type="file"')
    expect(html).toContain('capture="environment"')
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"')
  })
})
