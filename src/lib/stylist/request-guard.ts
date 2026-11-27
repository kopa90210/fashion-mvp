/** Latest-generation guard; cancellation does not imply server-side rollback. */
export function createRequestGuard() {
  let generation = 0
  let controller: AbortController | undefined
  function invalidate() {
    generation++
    controller?.abort()
    controller = undefined
  }
  return {
    invalidate,
    begin() {
      invalidate()
      const id = generation
      const current = new AbortController()
      controller = current
      return { signal: current.signal, isCurrent: () => generation === id && !current.signal.aborted }
    },
  }
}
