import { beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

vi.mock('server-only', () => ({}))

let validatePrivateImage: typeof import('./private-media').validatePrivateImage

beforeAll(async () => {
  ;({ validatePrivateImage } = await import('./private-media'))
})

describe('validatePrivateImage', () => {
  it('rejects an empty file', async () => {
    await expect(validatePrivateImage(new File([], 'empty.jpg', { type: 'image/jpeg' }))).rejects.toThrow('empty')
  })

  it('rejects a file larger than 10 MB before decoding', async () => {
    const bytes = new Uint8Array(10 * 1024 * 1024 + 1)
    await expect(validatePrivateImage(new File([bytes], 'large.jpg', { type: 'image/jpeg' }))).rejects.toThrow('10 MB')
  })

  it('rejects corrupt image bytes', async () => {
    await expect(validatePrivateImage(new File(['not-an-image'], 'fake.jpg', { type: 'image/jpeg' }))).rejects.toThrow('corrupt or unsupported')
  })

  it('rejects a declared MIME type that disagrees with decoded bytes', async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).png().toBuffer()
    await expect(validatePrivateImage(new File([png], 'fake.jpg', { type: 'image/jpeg' }))).rejects.toThrow('does not match')
  })

  it('rejects a compressed image whose decoded dimensions exceed the bridge limit', async () => {
    const png = await sharp({ create: { width: 5000, height: 5000, channels: 3, background: 'white' } }).png().toBuffer()
    await expect(validatePrivateImage(new File([png], 'large-pixels.png', { type: 'image/png' }))).rejects.toThrow('20 megapixel')
  })

  it('derives trusted metadata from decoded bytes', async () => {
    const jpeg = await sharp({ create: { width: 3, height: 2, channels: 3, background: 'white' } }).jpeg().toBuffer()
    await expect(validatePrivateImage(new File([jpeg], 'photo.jpg', { type: 'image/jpeg' }))).resolves.toMatchObject({ mimeType: 'image/jpeg', extension: 'jpg', width: 3, height: 2 })
  })
})
