import { useEffect, useRef, useState } from 'react'

const WINDOW_MS = 10_000

export type LongTaskStats = {
  countInWindow: number
  lastDurationMs: number
  supported: boolean
}

/**
 * Counts PerformanceObserver "longtask" entries (main thread >50ms) in a sliding window.
 */
export function useLongTaskObserver(enabled: boolean): LongTaskStats {
  const [stats, setStats] = useState<LongTaskStats>({
    countInWindow: 0,
    lastDurationMs: 0,
    supported: false,
  })
  const eventsRef = useRef<{ t: number; d: number }[]>([])

  useEffect(() => {
    if (!enabled || typeof PerformanceObserver === 'undefined') return

    let obs: PerformanceObserver | null = null
    try {
      obs = new PerformanceObserver((list) => {
        const now = performance.now()
        for (const e of list.getEntries()) {
          eventsRef.current.push({ t: now, d: e.duration })
        }
        const cutoff = now - WINDOW_MS
        eventsRef.current = eventsRef.current.filter((x) => x.t >= cutoff)
        const last = eventsRef.current.at(-1)
        setStats({
          countInWindow: eventsRef.current.length,
          lastDurationMs: last ? Math.round(last.d) : 0,
          supported: true,
        })
      })
      obs.observe({ type: 'longtask', buffered: true })
      queueMicrotask(() => {
        setStats((s) => (s.supported ? s : { ...s, supported: true }))
      })
    } catch {
      queueMicrotask(() => {
        setStats({
          countInWindow: 0,
          lastDurationMs: 0,
          supported: false,
        })
      })
    }

    const iv = window.setInterval(() => {
      const now = performance.now()
      const cutoff = now - WINDOW_MS
      const before = eventsRef.current.length
      eventsRef.current = eventsRef.current.filter((x) => x.t >= cutoff)
      if (eventsRef.current.length !== before) {
        setStats((s) => ({
          ...s,
          countInWindow: eventsRef.current.length,
        }))
      }
    }, 2000)

    return () => {
      clearInterval(iv)
      obs?.disconnect()
      eventsRef.current = []
    }
  }, [enabled])

  return stats
}
