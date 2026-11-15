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
const HOSTED_CATALOG_ORIGIN = 'https://wwmumdmpruqwralxniwk.supabase.co'
const PUBLIC_CURATED_PATH = '/storage/v1/object/public/wardrobe-images/curated/'
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
    const url = new URL(src, 'https://stylegraph.local')
    if (url.pathname.includes('/storage/v1/object/sign/private-wardrobe-media/')) {
      return true
    }

    // The hosted catalog already serves prepared public images from its CDN.
    return url.origin === HOSTED_CATALOG_ORIGIN
      && !url.username && !url.password
      && url.pathname.startsWith(PUBLIC_CURATED_PATH)
      && url.pathname.length > PUBLIC_CURATED_PATH.length
  } catch {
    return false
  }
}
