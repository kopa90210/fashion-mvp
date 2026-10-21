export type WardrobeImageProtocol = 'http' | 'https'

export type WardrobeRemotePattern = {
  protocol: WardrobeImageProtocol
  hostname: string
  port: string
  pathname: string
}

export type WardrobeImageConfig = {
  dangerouslyAllowLocalIP: boolean
  remotePatterns: WardrobeRemotePattern[]
}

const DEFAULT_SUPABASE_URL = 'https://svbkadgcpbpnbfzaqvsf.supabase.co'
const LOCAL_IMAGE_HOSTS = new Set(['127.0.0.1', 'localhost'])

function parseSupabaseUrl(value?: string): URL {
  try {
    return new URL(value || DEFAULT_SUPABASE_URL)
  } catch {
    return new URL(DEFAULT_SUPABASE_URL)
  }
}

export function createWardrobeImageConfig(
  supabaseUrl: string | undefined,
  environment: string | undefined,
): WardrobeImageConfig {
  const parsed = parseSupabaseUrl(supabaseUrl)
  const protocol: WardrobeImageProtocol = parsed.protocol === 'http:' ? 'http' : 'https'
  const basePattern = {
    protocol,
    hostname: parsed.hostname,
    port: parsed.port,
  }

  return {
    dangerouslyAllowLocalIP:
      environment === 'development' && LOCAL_IMAGE_HOSTS.has(parsed.hostname),
    remotePatterns: [
      {
        ...basePattern,
        pathname: '/storage/v1/object/public/wardrobe-images/**',
      },
      {
        ...basePattern,
        pathname: '/storage/v1/object/sign/private-wardrobe-media/**',
      },
    ],
  }
}

export function shouldBypassWardrobeImageOptimization(src: string): boolean {
  if (src.startsWith('data:') || src.startsWith('blob:')) return true

  try {
    return new URL(src, 'https://stylegraph.local').pathname.includes(
      '/storage/v1/object/sign/private-wardrobe-media/',
    )
  } catch {
    return false
  }
}
