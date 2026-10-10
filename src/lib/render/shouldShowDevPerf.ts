import { isLowMemoryMode } from './canvasDpr'

/**
 * DEV PERF overlay: `?perf=1`, or (dev build ∧ low-memory off).
 */
export function shouldShowDevPerf(
  search: string = typeof window !== 'undefined' ? window.location.search : '',
  opts?: { isDev?: boolean; lowMemory?: boolean },
): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
  if (params.get('perf') === '1') return true
  const isDev = opts?.isDev ?? import.meta.env.DEV
  const lowMemory = opts?.lowMemory ?? isLowMemoryMode()
  return Boolean(isDev && !lowMemory)
}
