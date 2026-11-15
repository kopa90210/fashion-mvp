import { afterEach, expect, it, vi } from 'vitest'

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

const { info, getContext } = vi.hoisted(() => ({
  info: vi.fn(),
  getContext: vi.fn(),
}))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext: getContext }))

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

it('validates the original upload bytes through the Cloudflare Images binding without Sharp', async () => {
  vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
  getContext.mockReturnValue({ env: { IMAGES: { info } } })
  info.mockImplementation(async (stream: ReadableStream) => {
    expect(await new Response(stream).text()).toBe('test bytes')
    return { format: 'image/jpeg', width: 10, height: 20 }
  })

  const { validatePrivateImage } = await import('./private-media')
  await expect(validatePrivateImage(new File(['test bytes'], 'test.jpg', { type: 'image/jpeg' })))
    .resolves.toMatchObject({ mimeType: 'image/jpeg', extension: 'jpg', width: 10, height: 20 })

  info.mockResolvedValueOnce({ format: 'image/png', width: 10, height: 20 })
  await expect(validatePrivateImage(new File(['test bytes'], 'test.jpg', { type: 'image/jpeg' })))
    .rejects.toThrow('MIME type does not match')

  info.mockResolvedValueOnce({ format: 'image/jpeg', width: 5000, height: 5000 })
  await expect(validatePrivateImage(new File(['test bytes'], 'test.jpg', { type: 'image/jpeg' })))
    .rejects.toThrow('20 megapixel')

  getContext.mockReturnValueOnce({ env: {} })
  await expect(validatePrivateImage(new File(['test bytes'], 'test.jpg')))
    .rejects.toThrow('Image validation is unavailable on this deployment')
})
