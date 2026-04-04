import type { PartialDepthBook } from './types'

/** Stable string for deduping React publishes and memo comparisons (not cryptographic). */
export function partialDepthContentKey(b: PartialDepthBook): string {
  const idKey = b.lastUpdateIdStr ?? String(b.lastUpdateId)
  const bidPart = b.bids.map((l) => `${l.price}\t${l.quantity}`).join('\n')
  const askPart = b.asks.map((l) => `${l.price}\t${l.quantity}`).join('\n')
  return `${idKey}\n${bidPart}\n${askPart}`
}
