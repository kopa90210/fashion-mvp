/**
 * Explicit date formatting policy for Profile Style Studio:
 * 1. For timestamps (e.g. savedAt, pinnedAt), format using a consistent locale
 *    ('en-US') and the user's stored IANA timezone. Server-formatted display strings
 *    ensure identical initial SSR and browser output.
 * 2. For worn_on date-only values ('YYYY-MM-DD'), preserve the calendar date
 *    without timezone shifts.
 *
 * Never uses default-locale formatting or timezone-shifting Date constructors.
 */

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Format a calendar date-only string ('YYYY-MM-DD') into a stable display string
 * (e.g. 'Oct 25' or 'Oct 25, 2025').
 *
 * Pure arithmetic parsing: zero timezone conversion, zero shift across day boundaries.
 */
export function formatProfileCalendarDate(
  dateOnly: string,
  options?: { includeYear?: boolean; style?: 'monthDay' | 'dayMonthYear' },
): string {
  if (!dateOnly || typeof dateOnly !== 'string') return ''
  const parts = dateOnly.split('-')
  if (parts.length !== 3) return dateOnly

  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const day = parseInt(parts[2], 10)

  if (isNaN(year) || isNaN(month) || isNaN(day) || month < 1 || month > 12 || day < 1 || day > 31) {
    return dateOnly
  }

  const monthName = MONTH_NAMES[month - 1]
  if (options?.style === 'dayMonthYear') {
    return options.includeYear !== false ? `${day} ${monthName} ${year}` : `${day} ${monthName}`
  }
  if (options?.includeYear) {
    return `${monthName} ${day}, ${year}`
  }
  return `${monthName} ${day}`
}

/**
 * Format an ISO timestamp string into a consistent display string using the user's
 * stored IANA timezone and an explicit 'en-US' locale.
 */
export function formatProfileTimestamp(
  isoString: string,
  timeZone = 'UTC',
  options?: { includeYear?: boolean; style?: 'monthDay' | 'dayMonthYear' },
): string {
  if (!isoString) return ''
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''

  const safeTimezone = isValidTimeZone(timeZone) ? timeZone : 'UTC'

  if (options?.style === 'dayMonthYear') {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: safeTimezone,
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).formatToParts(date)
      const day = parts.find((p) => p.type === 'day')?.value ?? ''
      const month = parts.find((p) => p.type === 'month')?.value ?? ''
      const year = parts.find((p) => p.type === 'year')?.value ?? ''
      return options.includeYear !== false ? `${day} ${month} ${year}` : `${day} ${month}`
    } catch {
      // graceful fallback
    }
  }

  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: safeTimezone,
      month: 'short',
      day: 'numeric',
      ...(options?.includeYear ? { year: 'numeric' } : {}),
    })
    return formatter.format(date)
  } catch {
    // Graceful fallback to UTC if timezone formatting fails
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      month: 'short',
      day: 'numeric',
      ...(options?.includeYear ? { year: 'numeric' } : {}),
    })
    return formatter.format(date)
  }
}

function isValidTimeZone(tz: string): boolean {
  if (!tz) return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}
