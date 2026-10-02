import 'server-only'
import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'
import sharp, { type Metadata } from 'sharp'

const BUCKET = 'private-wardrobe-media'
const MAX_BYTES = 10 * 1024 * 1024
const MAX_PIXELS = 20_000_000
const FORMATS = new Map([['jpeg', { mime: 'image/jpeg', ext: 'jpg' }], ['png', { mime: 'image/png', ext: 'png' }], ['webp', { mime: 'image/webp', ext: 'webp' }]])

export type PrivateUpload = { bucket: string; path: string; mimeType: string; byteSize: number; sha256: string; width: number; height: number; stableUrl: string }
export type ValidatedPrivateImage = { bytes: Buffer; mimeType: string; extension: string; sha256: string; width: number; height: number }

type StorageFailure = {
  message?: string
  code?: string
  statusCode?: string | number
}

function storageError(operation: string, error: StorageFailure) {
  const detail = [error.code, error.statusCode, error.message]
    .filter((value): value is string | number => value !== undefined && value !== '')
    .join(': ')
  return new Error(detail ? `${operation}: ${detail}` : operation)
}

async function authenticatedStorage(
  supabase: SupabaseClient,
  expectedUserId: string,
) {
  const { data, error } = await supabase.auth.getSession()
  const session = data.session
  if (error || !session?.access_token || session.user.id !== expectedUserId) {
    throw new Error('Authenticated private media session is unavailable')
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase client configuration is unavailable')

  return createSupabaseClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    },
  }).storage.from(BUCKET)
}

export async function validatePrivateImage(file: File): Promise<ValidatedPrivateImage> {
  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.length === 0) throw new Error('Image file is empty')
  if (bytes.length > MAX_BYTES) throw new Error('Image exceeds the 10 MB limit')
  let metadata: Metadata
  try { metadata = await sharp(bytes, { failOn: 'error' }).metadata() } catch { throw new Error('Image content is corrupt or unsupported') }
  const format = metadata.format && FORMATS.get(metadata.format)
  if (!format || !metadata.width || !metadata.height) throw new Error('Only JPEG, PNG, and WebP images are supported')
  if (metadata.width * metadata.height > MAX_PIXELS) throw new Error('Image exceeds the 20 megapixel limit')
  if (file.type && file.type !== format.mime) throw new Error('Image MIME type does not match its content')
  return { bytes, mimeType: format.mime, extension: format.ext, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), width: metadata.width, height: metadata.height }
}

export async function uploadValidatedPrivateImage(
  supabase: SupabaseClient,
  userId: string,
  file: File,
): Promise<PrivateUpload> {
  const validated = await validatePrivateImage(file)
  const path = `${userId}/${crypto.randomUUID()}.${validated.extension}`
  const storage = await authenticatedStorage(supabase, userId)
  const { error } = await storage.upload(path, validated.bytes, {
    contentType: validated.mimeType,
    upsert: false,
  })
  if (error) throw storageError('Could not upload private image', error)
  return { bucket: BUCKET, path, mimeType: validated.mimeType, byteSize: validated.bytes.length, sha256: validated.sha256, width: validated.width, height: validated.height, stableUrl: `private://${BUCKET}/${path}` }
}

export async function deletePrivateObject(
  supabase: SupabaseClient,
  userId: string,
  path: string,
) {
  if (!path.startsWith(`${userId}/`) || !/^[0-9a-f-]+\/[0-9a-f-]+\.(jpg|png|webp)$/.test(path)) {
    throw new Error('Refusing to delete an object outside the authenticated user path')
  }
  const storage = await authenticatedStorage(supabase, userId)
  const { error } = await storage.remove([path])
  if (error) throw storageError('Could not remove private image', error)
}

export async function signedOwnedPrivateUrl(
  supabase: SupabaseClient,
  mediaAssetId: string,
  expiresIn = 300,
) {
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('Not authenticated')
  const { data: asset, error } = await supabase.from('media_assets').select('owner_id, bucket_id, object_path, status').eq('id', mediaAssetId).single()
  if (error || !asset || asset.owner_id !== auth.user.id || asset.status !== 'active'
    || asset.bucket_id !== BUCKET || !asset.object_path.startsWith(`${auth.user.id}/`)) {
    throw new Error('Private media asset not found')
  }
  const storage = await authenticatedStorage(supabase, auth.user.id)
  const { data, error: signingError } = await storage.createSignedUrl(asset.object_path, expiresIn)
  if (signingError) throw storageError('Could not create private image URL', signingError)
  if (!data?.signedUrl) throw new Error('Could not create private image URL')
  return data.signedUrl
}
