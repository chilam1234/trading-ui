import { useEffect, useRef, useState } from 'react'

const RING = 180
const UI_TICK_MS = 300

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  )
  return sorted[idx] ?? 0
}

export type FrameTimeSample = {
  p50Ms: number
  p95Ms: number
  sampleCount: number
}

/**
 * Samples rAF delta times (rough frame budget) into a ring; exposes rolling p50/p95.
 */
export function useFrameTimeSampler(enabled: boolean): FrameTimeSample {
  const ringRef = useRef<number[]>([])
  const lastRef = useRef<number | null>(null)
  const rafIdRef = useRef<number | null>(null)
  const [out, setOut] = useState<FrameTimeSample>({
    p50Ms: 0,
    p95Ms: 0,
    sampleCount: 0,
  })

  useEffect(() => {
    if (!enabled) return

    let lastUi = performance.now()

    const tick = (now: number) => {
      const last = lastRef.current
      lastRef.current = now
      if (last != null) {
        const dt = now - last
        const ring = ringRef.current
        ring.push(dt)
        if (ring.length > RING) ring.shift()
      }

      if (now - lastUi >= UI_TICK_MS) {
        lastUi = now
        const ring = ringRef.current
        const sorted = [...ring].sort((a, b) => a - b)
        setOut({
          p50Ms: percentile(sorted, 50),
          p95Ms: percentile(sorted, 95),
          sampleCount: ring.length,
        })
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }

    rafIdRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      lastRef.current = null
      ringRef.current = []
    }
  }, [enabled])

  return out
}
