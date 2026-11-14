/**
 * Account identity derivation from verified Supabase auth user fields.
 * No custom user profile schema or decoration fields required.
 */

export function deriveDisplayNameAndInitials(user: {
  id: string
  email?: string | null
  user_metadata?: Record<string, unknown> | null
}): { displayName: string; initials: string } {
  const meta = user.user_metadata ?? {}

  const rawName =
    (typeof meta.full_name === 'string' && meta.full_name.trim()) ||
    (typeof meta.name === 'string' && meta.name.trim()) ||
    (typeof meta.display_name === 'string' && meta.display_name.trim()) ||
    ''

  if (rawName) {
    const words = rawName.split(/\s+/).filter(Boolean)
    let initials = ''
    if (words.length === 1) {
      initials = words[0].slice(0, 2).toUpperCase()
    } else {
      initials = (words[0][0] + words[words.length - 1][0]).toUpperCase()
    }
    return {
      displayName: rawName,
      initials: initials || 'M',
    }
  }

  // Neutral fallback when display name is not provided
  return {
    displayName: 'Member',
    initials: 'M',
  }
}
