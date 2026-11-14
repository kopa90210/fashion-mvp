/**
 * Gate 4: Profile Personalization & Appearance
 * Scoped appearance preferences stored on this device.
 *
 * Invariants:
 * - Scoped exclusively to the profile studio container; never recolors other screens.
 * - Never stores user identity, email, wardrobe items, or media URLs.
 * - Never affects quiz answers, Fashion DNA vectors, or recommendations.
 * - Validated versioned schema with graceful fallbacks on corrupted/blocked storage.
 */

export type ProfileAppearanceMode = 'light' | 'dark' | 'system'
export type ProfileAccent = 'sage' | 'terracotta' | 'plum' | 'slate'

export interface ProfileAppearancePreferences {
  version: 1
  mode: ProfileAppearanceMode
  accent: ProfileAccent
}

export const DEFAULT_APPEARANCE: ProfileAppearancePreferences = {
  version: 1,
  mode: 'system',
  accent: 'sage',
}

export const APPEARANCE_STORAGE_KEY = 'stylegraph_profile_appearance_v1'

export interface AccentDefinition {
  key: ProfileAccent
  label: string
  description: string
  swatchLight: string
  swatchDark: string
  light: {
    bg: string
    surface: string
    surfaceSubtle: string
    text: string
    textMuted: string
    border: string
    borderSubtle: string
    accent: string
    accentMuted: string
    accentText: string
    aura: string
  }
  dark: {
    bg: string
    surface: string
    surfaceSubtle: string
    text: string
    textMuted: string
    border: string
    borderSubtle: string
    accent: string
    accentMuted: string
    accentText: string
    aura: string
  }
}

export const ACCENT_DEFINITIONS: Record<ProfileAccent, AccentDefinition> = {
  sage: {
    key: 'sage',
    label: 'Sage',
    description: 'Calm, botanical undertones of eucalyptus and greyed green.',
    swatchLight: '#4a6750',
    swatchDark: '#7da383',
    light: {
      bg: '#f7f5f1',
      surface: '#fffdfa',
      surfaceSubtle: '#ede8df',
      text: '#1a1917',
      textMuted: '#686055',
      border: '#d6cdbf',
      borderSubtle: '#e2dbd0',
      accent: '#445f49',
      accentMuted: '#e3ebe4',
      accentText: '#ffffff',
      aura: 'radial-gradient(circle at 50% 0%, rgba(95, 134, 103, 0.14) 0%, rgba(247, 245, 241, 0) 75%)',
    },
    dark: {
      bg: '#141514',
      surface: '#1c1e1c',
      surfaceSubtle: '#252925',
      text: '#f5f3ef',
      textMuted: '#a4a199',
      border: '#353a35',
      borderSubtle: '#2a2f2a',
      accent: '#7da383',
      accentMuted: '#243026',
      accentText: '#101712',
      aura: 'radial-gradient(circle at 50% 0%, rgba(125, 163, 131, 0.16) 0%, rgba(20, 21, 20, 0) 75%)',
    },
  },
  terracotta: {
    key: 'terracotta',
    label: 'Terracotta',
    description: 'Warm, sun-baked clay with refined earth depth.',
    swatchLight: '#9c523a',
    swatchDark: '#d97d62',
    light: {
      bg: '#f8f4f0',
      surface: '#fffdfa',
      surfaceSubtle: '#f0e6de',
      text: '#1d1917',
      textMuted: '#6d5f57',
      border: '#dbc9be',
      borderSubtle: '#e6dad1',
      accent: '#944a33',
      accentMuted: '#f5e8e3',
      accentText: '#ffffff',
      aura: 'radial-gradient(circle at 50% 0%, rgba(168, 86, 61, 0.13) 0%, rgba(248, 244, 240, 0) 75%)',
    },
    dark: {
      bg: '#171413',
      surface: '#211c1a',
      surfaceSubtle: '#2e2623',
      text: '#f7f3ef',
      textMuted: '#a89c96',
      border: '#3d332f',
      borderSubtle: '#302824',
      accent: '#d97d62',
      accentMuted: '#382520',
      accentText: '#1a0e0a',
      aura: 'radial-gradient(circle at 50% 0%, rgba(217, 125, 98, 0.16) 0%, rgba(23, 20, 19, 0) 75%)',
    },
  },
  plum: {
    key: 'plum',
    label: 'Plum',
    description: 'Understated dark mulberry and tailored vintage violet.',
    swatchLight: '#6e4560',
    swatchDark: '#b881a4',
    light: {
      bg: '#f7f3f5',
      surface: '#fffdfa',
      surfaceSubtle: '#ece3e8',
      text: '#1b171a',
      textMuted: '#685d65',
      border: '#d4c7d0',
      borderSubtle: '#e2d7df',
      accent: '#663d59',
      accentMuted: '#ede3ea',
      accentText: '#ffffff',
      aura: 'radial-gradient(circle at 50% 0%, rgba(125, 75, 108, 0.13) 0%, rgba(247, 243, 245, 0) 75%)',
    },
    dark: {
      bg: '#161315',
      surface: '#201b1f',
      surfaceSubtle: '#2c242b',
      text: '#f6f2f5',
      textMuted: '#a69aa3',
      border: '#3a3038',
      borderSubtle: '#2d252b',
      accent: '#b881a4',
      accentMuted: '#35212f',
      accentText: '#180d15',
      aura: 'radial-gradient(circle at 50% 0%, rgba(184, 129, 164, 0.16) 0%, rgba(22, 19, 21, 0) 75%)',
    },
  },
  slate: {
    key: 'slate',
    label: 'Slate',
    description: 'Crisp, architectural cool grey with balanced graphite tones.',
    swatchLight: '#475569',
    swatchDark: '#94a3b8',
    light: {
      bg: '#f4f5f7',
      surface: '#fffdfa',
      surfaceSubtle: '#e8ebef',
      text: '#15191e',
      textMuted: '#5d6470',
      border: '#ccd2db',
      borderSubtle: '#dbe0e7',
      accent: '#3e4c5e',
      accentMuted: '#e2e7ee',
      accentText: '#ffffff',
      aura: 'radial-gradient(circle at 50% 0%, rgba(71, 85, 105, 0.14) 0%, rgba(244, 245, 247, 0) 75%)',
    },
    dark: {
      bg: '#121417',
      surface: '#1b1e23',
      surfaceSubtle: '#252a32',
      text: '#f2f4f7',
      textMuted: '#9aa2af',
      border: '#333944',
      borderSubtle: '#272d36',
      accent: '#94a3b8',
      accentMuted: '#222c3a',
      accentText: '#0f141c',
      aura: 'radial-gradient(circle at 50% 0%, rgba(148, 163, 184, 0.16) 0%, rgba(18, 20, 23, 0) 75%)',
    },
  },
}

/**
 * Safely parse stored preferences from browser storage.
 */
export function getStoredAppearance(): ProfileAppearancePreferences {
  if (typeof window === 'undefined') {
    return DEFAULT_APPEARANCE
  }

  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
    if (!raw) return DEFAULT_APPEARANCE

    const parsed = JSON.parse(raw) as Partial<ProfileAppearancePreferences>
    if (parsed.version !== 1) return DEFAULT_APPEARANCE

    const validModes: ProfileAppearanceMode[] = ['light', 'dark', 'system']
    const validAccents: ProfileAccent[] = ['sage', 'terracotta', 'plum', 'slate']

    const mode = validModes.includes(parsed.mode as ProfileAppearanceMode)
      ? (parsed.mode as ProfileAppearanceMode)
      : DEFAULT_APPEARANCE.mode

    const accent = validAccents.includes(parsed.accent as ProfileAccent)
      ? (parsed.accent as ProfileAccent)
      : DEFAULT_APPEARANCE.accent

    return { version: 1, mode, accent }
  } catch {
    // QuotaExceededError, SecurityError (storage blocked), or malformed JSON
    return DEFAULT_APPEARANCE
  }
}

/**
 * Safely persist appearance preferences to local browser storage.
 */
export function setStoredAppearance(prefs: ProfileAppearancePreferences): void {
  if (typeof window === 'undefined') return

  try {
    const payload = JSON.stringify({
      version: 1,
      mode: prefs.mode,
      accent: prefs.accent,
    })
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, payload)
  } catch {
    // Graceful degradation when browser private browsing or storage quota blocks writes
  }
}

/**
 * Reset stored appearance preferences on this device.
 */
export function resetStoredAppearance(): ProfileAppearancePreferences {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(APPEARANCE_STORAGE_KEY)
    } catch {
      // Ignored
    }
  }
  return DEFAULT_APPEARANCE
}

/**
 * Determine the effective light or dark theme based on system query.
 */
export function resolveEffectiveTheme(
  mode: ProfileAppearanceMode,
  systemIsDark: boolean,
): 'light' | 'dark' {
  if (mode === 'dark') return 'dark'
  if (mode === 'light') return 'light'
  return systemIsDark ? 'dark' : 'light'
}

/**
 * Build CSS variable record for the studio wrapper container.
 */
export function buildProfileThemeVariables(
  accent: ProfileAccent,
  effectiveMode: 'light' | 'dark',
): React.CSSProperties {
  const definition = ACCENT_DEFINITIONS[accent] ?? ACCENT_DEFINITIONS.sage
  const palette = effectiveMode === 'dark' ? definition.dark : definition.light

  return {
    '--studio-bg': palette.bg,
    '--studio-surface': palette.surface,
    '--studio-surface-subtle': palette.surfaceSubtle,
    '--studio-text': palette.text,
    '--studio-text-muted': palette.textMuted,
    '--studio-border': palette.border,
    '--studio-border-subtle': palette.borderSubtle,
    '--studio-accent': palette.accent,
    '--studio-accent-muted': palette.accentMuted,
    '--studio-accent-text': palette.accentText,
    '--studio-aura-gradient': palette.aura,
  } as React.CSSProperties
}
