import type { KlineTick } from '../binance/types'

/** Keep the latest tick per symbol+openTime (shed / catch-up). */
export function coalesceKlines(klines: readonly KlineTick[]): KlineTick[] {
  if (klines.length <= 1) return klines.slice()
  const byKey = new Map<string, KlineTick>()
  for (const k of klines) {
    byKey.set(`${k.symbol}\0${k.openTime}`, k)
  }
  return [...byKey.values()]
}
