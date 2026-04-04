/** localStorage key for persisted depth card order (left-to-right). */
export const OB_DEPTH_STREAM_ORDER_KEY = 'trading-ui.ob-depth-stream-order'

function streamNorm(s: string): string {
  return s.toLowerCase()
}

/** Merge saved order with current subscribed streams: keep relative order, append new ids. */
export function mergeStreamOrder(preferred: string[], current: string[]): string[] {
  const currentByNorm = new Map<string, string>()
  for (const s of current) {
    currentByNorm.set(streamNorm(s), s)
  }
  const out: string[] = []
  const used = new Set<string>()
  for (const id of preferred) {
    const canon = currentByNorm.get(streamNorm(id))
    if (canon && !used.has(streamNorm(canon))) {
      out.push(canon)
      used.add(streamNorm(canon))
    }
  }
  for (const s of current) {
    if (!used.has(streamNorm(s))) {
      out.push(s)
      used.add(streamNorm(s))
    }
  }
  return out
}

export function loadStreamOrder(): string[] {
  try {
    const raw = localStorage.getItem(OB_DEPTH_STREAM_ORDER_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x): x is string => typeof x === 'string' && x.length > 0)
  } catch {
    return []
  }
}
