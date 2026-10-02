import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const supabaseJsMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => supabaseJsMocks)

let validatePrivateImage: typeof import('./private-media').validatePrivateImage
let uploadValidatedPrivateImage: typeof import('./private-media').uploadValidatedPrivateImage

beforeAll(async () => {
  ;({ validatePrivateImage, uploadValidatedPrivateImage } = await import('./private-media'))
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
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

describe('uploadValidatedPrivateImage', () => {
  it('binds the verified user access token to the storage request', async () => {
    const userId = '11111111-1111-4111-8111-111111111111'
    const upload = vi.fn().mockResolvedValue({ error: null })
    supabaseJsMocks.createClient.mockReturnValue({
      storage: { from: vi.fn().mockReturnValue({ upload }) },
    })
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.test')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    const caller = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'user-token', user: { id: userId } } },
          error: null,
        }),
      },
    }
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).jpeg().toBuffer()

    await uploadValidatedPrivateImage(
      caller as never,
      userId,
      new File([jpeg], 'photo.jpg', { type: 'image/jpeg' }),
    )

    expect(supabaseJsMocks.createClient).toHaveBeenCalledWith(
      'https://project.test',
      'anon-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer user-token' } },
      }),
    )
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${userId}/[0-9a-f-]+\\.jpg$`)),
      expect.any(Buffer),
      { contentType: 'image/jpeg', upsert: false },
    )
  })

  it('rejects a session that belongs to a different user', async () => {
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'white' } }).jpeg().toBuffer()
    const caller = {
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: 'user-token', user: { id: 'other-user' } } },
          error: null,
        }),
      },
    }

    await expect(uploadValidatedPrivateImage(
      caller as never,
      'expected-user',
      new File([jpeg], 'photo.jpg', { type: 'image/jpeg' }),
    )).rejects.toThrow('session is unavailable')
    expect(supabaseJsMocks.createClient).not.toHaveBeenCalled()
  })
})
