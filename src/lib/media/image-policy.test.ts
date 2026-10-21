import { describe, expect, it } from 'vitest'
import {
  createWardrobeImageConfig,
  shouldBypassWardrobeImageOptimization,
} from './image-policy'

describe('wardrobe image policy', () => {
  it('allows the local Supabase private IP only in development', () => {
    const localDevelopment = createWardrobeImageConfig(
      'http://127.0.0.1:54321',
      'development',
    )
    const localProduction = createWardrobeImageConfig(
      'http://127.0.0.1:54321',
      'production',
    )

    expect(localDevelopment.dangerouslyAllowLocalIP).toBe(true)
    expect(localProduction.dangerouslyAllowLocalIP).toBe(false)
    expect(localDevelopment.remotePatterns).toContainEqual({
      protocol: 'http',
      hostname: '127.0.0.1',
      port: '54321',
      pathname: '/storage/v1/object/public/wardrobe-images/**',
    })
  })

  it('keeps hosted Supabase patterns exact and private-IP access disabled', () => {
    const config = createWardrobeImageConfig(
      'https://project.supabase.co',
      'production',
    )

    expect(config.dangerouslyAllowLocalIP).toBe(false)
    expect(config.remotePatterns).toEqual([
      {
        protocol: 'https',
        hostname: 'project.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/wardrobe-images/**',
      },
      {
        protocol: 'https',
        hostname: 'project.supabase.co',
        port: '',
        pathname: '/storage/v1/object/sign/private-wardrobe-media/**',
      },
    ])
  })

  it('bypasses optimization for signed private previews but not curated public media', () => {
    expect(
      shouldBypassWardrobeImageOptimization(
        'https://project.supabase.co/storage/v1/object/sign/private-wardrobe-media/item.png?token=secret',
      ),
    ).toBe(true)
    expect(
      shouldBypassWardrobeImageOptimization(
        'http://127.0.0.1:54321/storage/v1/object/public/wardrobe-images/item.png',
      ),
    ).toBe(false)
  })
})
