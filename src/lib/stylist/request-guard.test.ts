import { describe, expect, it } from 'vitest'
import { createRequestGuard } from './request-guard'
describe('request generation guard', () => {
  it('invalidates and aborts a superseded request', () => {
    const guard = createRequestGuard()
    const first = guard.begin()
    const second = guard.begin()
    expect(first.signal.aborted).toBe(true)
    expect(first.isCurrent()).toBe(false)
    expect(second.isCurrent()).toBe(true)
  })
  it('invalidates on input change or unmount without accepting late completion', () => {
    const guard = createRequestGuard()
    const first = guard.begin()
    guard.invalidate()
    expect(first.isCurrent()).toBe(false)
    expect(first.signal.aborted).toBe(true)
    expect(guard.begin().isCurrent()).toBe(true)
  })
})
