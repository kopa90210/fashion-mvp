import { expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('sharp', () => {
  throw new Error('Native decoder unavailable')
})

it('loads private media reads without a decoder and fails closed when validating an upload', async () => {
  const media = await import('./private-media')
  expect(media.signedOwnedPrivateUrl).toBeTypeOf('function')

  await expect(media.validatePrivateImage(new File(['image'], 'test.jpg')))
    .rejects.toThrow('Image validation is unavailable on this deployment')
})
