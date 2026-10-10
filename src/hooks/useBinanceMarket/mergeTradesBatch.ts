import type { NormalizedTrade } from '../../lib/binance/types'

export function mergeTradeBatchIntoPrev(
  prev: NormalizedTrade[],
  batch: NormalizedTrade[],
  opts: {
    workerMode: boolean
    maxTrades: number
    prevDedupHead: number
  },
): NormalizedTrade[] {
  const { workerMode, maxTrades, prevDedupHead } = opts
  if (batch.length === 0) return prev
  // Fast path: single-trade batches dominate live traffic (1-3 per flush).
  // Avoid Set-building/allocation until dedup passes; then a single prepend.
  if (batch.length === 1) {
    const t = batch[0]!
    const key = `${t.symbol}:${t.id}`
    const scan = Math.min(prevDedupHead, prev.length)
    for (let i = 0; i < scan; i++) {
      const p = prev[i]!
      if (`${p.symbol}:${p.id}` === key) {
        return prev // duplicate — zero allocation
      }
    }
    const next = [t, ...prev]
    return next.length > maxTrades ? next.slice(0, maxTrades) : next
  }
  if (workerMode) {
    // Worker's recentTradeKeys ring (8192 FIFO) already filtered evicted-window duplicates,
    // but ids evicted from the ring re-appear: scan the newest prevDedupHead rows too (P0).
    const incoming = batch.slice().reverse()
    const scan = Math.min(prevDedupHead, prev.length)
    const prevIds = new Set<string>()
    for (let i = 0; i < scan; i++) {
      const t = prev[i]!
      prevIds.add(`${t.symbol}:${t.id}`)
    }
    const seenIncoming = new Set<string>()
    const deduped: NormalizedTrade[] = []
    for (const trade of incoming) {
      const k = `${trade.symbol}:${trade.id}`
      if (seenIncoming.has(k)) continue
      seenIncoming.add(k)
      if (prevIds.has(k)) continue
      deduped.push(trade)
    }
    if (deduped.length === 0) return prev
    return deduped.length + prev.length > maxTrades
      ? [...deduped, ...prev].slice(0, maxTrades)
      : [...deduped, ...prev]
  }
  const incoming = batch.slice().reverse()
  const scan = Math.min(prevDedupHead, prev.length)
  const prevIds = new Set<string>()
  for (let i = 0; i < scan; i++) {
    const t = prev[i]!
    prevIds.add(`${t.symbol}:${t.id}`)
  }
  const seenIncoming = new Set<string>()
  const deduped: NormalizedTrade[] = []
  for (const trade of incoming) {
    const k = `${trade.symbol}:${trade.id}`
    if (seenIncoming.has(k)) continue
    seenIncoming.add(k)
    if (prevIds.has(k)) continue
    deduped.push(trade)
  }
  if (deduped.length === 0) return prev
  const next =
    deduped.length + prev.length > maxTrades
      ? [...deduped, ...prev].slice(0, maxTrades)
      : [...deduped, ...prev]
  return next
}
