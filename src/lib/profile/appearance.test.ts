import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  APPEARANCE_STORAGE_KEY,
  DEFAULT_APPEARANCE,
  buildProfileThemeVariables,
  getStoredAppearance,
  resetStoredAppearance,
  resolveEffectiveTheme,
  setStoredAppearance,
} from './appearance'

// In-memory mock storage for vitest node test environment
class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    return this.store.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }
}

describe('Profile Appearance Store & Theme Resolver', () => {
  const originalWindow = typeof window !== 'undefined' ? window : undefined

  beforeEach(() => {
    const memoryStorage = new MemoryStorage()
    Object.defineProperty(globalThis, 'window', {
      value: {
        localStorage: memoryStorage,
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      writable: true,
      configurable: true,
    })
  })

  it('returns DEFAULT_APPEARANCE when localStorage is empty', () => {
    expect(getStoredAppearance()).toEqual(DEFAULT_APPEARANCE)
  })

  it('parses valid stored preferences from localStorage', () => {
    const custom = { version: 1, mode: 'dark' as const, accent: 'plum' as const }
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(custom))

    expect(getStoredAppearance()).toEqual(custom)
  })

  it('falls back safely when storage is malformed or schema version mismatches', () => {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, '{ malformed json')
    expect(getStoredAppearance()).toEqual(DEFAULT_APPEARANCE)

    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ version: 99, mode: 'dark', accent: 'plum' }),
    )
    expect(getStoredAppearance()).toEqual(DEFAULT_APPEARANCE)
  })

  it('sanitizes invalid modes and accents to default values', () => {
    window.localStorage.setItem(
      APPEARANCE_STORAGE_KEY,
      JSON.stringify({ version: 1, mode: 'neon', accent: 'rainbow' }),
    )

    const res = getStoredAppearance()
    expect(res.mode).toBe('system')
    expect(res.accent).toBe('sage')
  })

  it('persists preferences safely to localStorage', () => {
    setStoredAppearance({ version: 1, mode: 'light', accent: 'terracotta' })
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual({
      version: 1,
      mode: 'light',
      accent: 'terracotta',
    })
  })

  it('resets appearance to defaults and removes storage item', () => {
    setStoredAppearance({ version: 1, mode: 'dark', accent: 'slate' })
    const res = resetStoredAppearance()
    expect(res).toEqual(DEFAULT_APPEARANCE)
    expect(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)).toBeNull()
  })

  it('resolves effective theme according to mode and system preference', () => {
    // Explicit dark
    expect(resolveEffectiveTheme('dark', false)).toBe('dark')
    expect(resolveEffectiveTheme('dark', true)).toBe('dark')

    // Explicit light
    expect(resolveEffectiveTheme('light', false)).toBe('light')
    expect(resolveEffectiveTheme('light', true)).toBe('light')

    // System follows systemIsDark
    expect(resolveEffectiveTheme('system', false)).toBe('light')
    expect(resolveEffectiveTheme('system', true)).toBe('dark')
  })

  it('builds comprehensive semantic theme variables for light and dark palettes', () => {
    const lightVars = buildProfileThemeVariables('sage', 'light') as Record<string, string>
    expect(lightVars['--studio-bg']).toBeDefined()
    expect(lightVars['--studio-surface']).toBeDefined()
    expect(lightVars['--studio-text']).toBeDefined()
    expect(lightVars['--studio-accent']).toBeDefined()
    expect(lightVars['--studio-aura-gradient']).toContain('radial-gradient')

    const darkVars = buildProfileThemeVariables('terracotta', 'dark') as Record<string, string>
    expect(darkVars['--studio-bg']).toBeDefined()
    expect(darkVars['--studio-text']).toBeDefined()
    expect(darkVars['--studio-accent']).toBeDefined()
    expect(darkVars['--studio-aura-gradient']).toContain('radial-gradient')
  })
})
