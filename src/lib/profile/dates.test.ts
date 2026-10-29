import { describe, it, expect } from 'vitest'
import { formatProfileCalendarDate, formatProfileTimestamp } from './dates'

describe('formatProfileCalendarDate (date-only values)', () => {
  it('formats calendar date-only strings consistently without timezone shifts', () => {
    expect(formatProfileCalendarDate('2026-10-25')).toBe('Oct 25')
    expect(formatProfileCalendarDate('2026-01-01')).toBe('Jan 1')
    expect(formatProfileCalendarDate('2026-12-31')).toBe('Dec 31')
  })

  it('includes year when requested', () => {
    expect(formatProfileCalendarDate('2026-10-25', { includeYear: true })).toBe('Oct 25, 2026')
    expect(formatProfileCalendarDate('2024-02-29', { includeYear: true })).toBe('Feb 29, 2024')
  })

  it('never shifts date regardless of runtime or timezone', () => {
    // Testing edge dates like end of month or year
    const endOfYear = '2026-12-31'
    expect(formatProfileCalendarDate(endOfYear)).toBe('Dec 31')
    const startOfYear = '2026-01-01'
    expect(formatProfileCalendarDate(startOfYear)).toBe('Jan 1')
  })

  it('returns raw string for malformed input gracefully', () => {
    expect(formatProfileCalendarDate('')).toBe('')
    expect(formatProfileCalendarDate('invalid-date')).toBe('invalid-date')
    expect(formatProfileCalendarDate('2026-99-99')).toBe('2026-99-99')
  })
})

describe('formatProfileTimestamp (ISO timestamps)', () => {
  const sampleIsoUtcMidnight = '2026-10-25T01:30:00.000Z'

  it('formats timestamp in UTC consistently', () => {
    const formatted = formatProfileTimestamp(sampleIsoUtcMidnight, 'UTC')
    expect(formatted).toBe('Oct 25')
  })

  it('formats timestamp in America/New_York with proper local calendar day shift', () => {
    // 01:30 UTC on Oct 25 is 21:30 EDT on Oct 24 in New York
    const formatted = formatProfileTimestamp(sampleIsoUtcMidnight, 'America/New_York')
    expect(formatted).toBe('Oct 24')
  })

  it('formats timestamp in Asia/Tokyo with local date', () => {
    // 01:30 UTC on Oct 25 is 10:30 JST on Oct 25 in Tokyo
    const formatted = formatProfileTimestamp(sampleIsoUtcMidnight, 'Asia/Tokyo')
    expect(formatted).toBe('Oct 25')
  })

  it('includes year when requested', () => {
    expect(
      formatProfileTimestamp(sampleIsoUtcMidnight, 'UTC', { includeYear: true }),
    ).toBe('Oct 25, 2026')
  })

  it('handles invalid timezone by falling back to UTC safely', () => {
    expect(formatProfileTimestamp(sampleIsoUtcMidnight, 'Invalid/Timezone')).toBe('Oct 25')
  })

  it('returns empty string for invalid timestamp strings', () => {
    expect(formatProfileTimestamp('')).toBe('')
    expect(formatProfileTimestamp('not-a-timestamp')).toBe('')
  })
})
