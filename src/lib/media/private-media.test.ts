import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'

const supabaseJsMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@supabase/supabase-js', () => supabaseJsMocks)

let validatePrivateImage: typeof import('./private-media').validatePrivateImage
let uploadValidatedPrivateImage: typeof import('./private-media').uploadValidatedPrivateImage
let signedOwnedPrivateUrl: typeof import('./private-media').signedOwnedPrivateUrl
let signedOwnedPrivatePreviewUrl: typeof import('./private-media').signedOwnedPrivatePreviewUrl

beforeAll(async () => {
  ;({ validatePrivateImage, uploadValidatedPrivateImage, signedOwnedPrivateUrl, signedOwnedPrivatePreviewUrl } = await import('./private-media'))
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('private image signing', () => {
  const userId = '11111111-1111-4111-8111-111111111111'

  function signingClient(signingError: unknown = null, overrides: Record<string, unknown> = {}) {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.test')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key')
    const sign = vi.fn().mockResolvedValue({
      data: signingError ? null : { signedUrl: 'https://signed.test/item.jpg' },
      error: signingError,
    })
    supabaseJsMocks.createClient.mockReturnValue({ storage: { from: vi.fn().mockReturnValue({ createSignedUrl: sign }) } })
    const asset = { owner_id: userId, bucket_id: 'private-wardrobe-media', object_path: `${userId}/asset.jpg`, status: 'active', ...overrides }
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: asset, error: null }) }
    const caller = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null }),
        getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'user-token', user: { id: userId } } }, error: null }),
      },
      from: vi.fn().mockReturnValue(query),
    }
    return { caller, sign }
  }

  it('returns a signed preview after validating ownership', async () => {
    const { caller, sign } = signingClient()
    await expect(signedOwnedPrivatePreviewUrl(caller as never, 'asset-id')).resolves.toBe('https://signed.test/item.jpg')
    expect(sign).toHaveBeenCalledWith(`${userId}/asset.jpg`, 300)
    expect(supabaseJsMocks.createClient).toHaveBeenCalledWith('https://project.test', 'anon-key', expect.objectContaining({ global: { headers: { Authorization: 'Bearer user-token' } } }))
  })

  it('returns null and logs a missing object without exposing a path or token', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { caller } = signingClient({ code: 'NoSuchKey', statusCode: '404', message: 'Object not found' })
    await expect(signedOwnedPrivatePreviewUrl(caller as never, 'asset-id')).resolves.toBeNull()
    expect(warning).toHaveBeenCalledWith('Private media preview unavailable', { mediaAssetId: 'asset-id', code: 'NoSuchKey' })
  })

  it('still rejects missing images when the caller requires an image', async () => {
    const { caller } = signingClient({ code: 'NoSuchKey', statusCode: '404', message: 'Object not found' })
    await expect(signedOwnedPrivateUrl(caller as never, 'asset-id')).rejects.toThrow('NoSuchKey: 404: Object not found')
  })

  it.each([
    { code: 'AccessDenied', statusCode: '403', message: 'Access denied' },
    { code: 'NoSuchBucket', statusCode: '404', message: 'Bucket not found' },
    { code: 'InternalError', statusCode: '500', message: 'Storage unavailable' },
    { statusCode: '404', message: 'Unknown failure' },
  ])('does not hide other storage failures: $message', async (error) => {
    const { caller } = signingClient(error)
    await expect(signedOwnedPrivatePreviewUrl(caller as never, 'asset-id')).rejects.toThrow(error.message)
  })

  it.each([
    { owner_id: 'other-user' },
    { object_path: 'other-user/asset.jpg' },
    { bucket_id: 'public-bucket' },
    { status: 'deleted' },
  ])('rejects an unauthorized or inactive asset before signing: %j', async (override) => {
    const { caller, sign } = signingClient(null, override)
    await expect(signedOwnedPrivatePreviewUrl(caller as never, 'asset-id')).rejects.toThrow('Private media asset not found')
    expect(sign).not.toHaveBeenCalled()
  })

  it('does not turn an expired session into a missing preview', async () => {
    const { caller, sign } = signingClient()
    caller.auth.getUser.mockResolvedValue({ data: { user: null }, error: null })
    await expect(signedOwnedPrivatePreviewUrl(caller as never, 'asset-id')).rejects.toThrow('Not authenticated')
    expect(sign).not.toHaveBeenCalled()
  })
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
