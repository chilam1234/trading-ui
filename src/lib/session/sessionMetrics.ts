import type { NormalizedTrade } from '../binance/types'

export type SessionDeskMetrics = {
  tradeCount: number
  vwap: number | null
  sessionHigh: number | null
  sessionLow: number | null
  largestPrintNotional: number | null
}

/**
 * Aggregates over all trades for `symbolUpper` in the in-memory tape (newest-first order).
 */
export function computeSessionDeskMetrics(
  trades: readonly NormalizedTrade[],
  symbolUpper: string,
): SessionDeskMetrics {
  const sym = symbolUpper.toUpperCase()
  let sumPxQty = 0
  let sumQty = 0
  let high: number | null = null
  let low: number | null = null
  let maxNotional: number | null = null
  let n = 0

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i]
    if (!t || t.symbol.toUpperCase() !== sym) continue
    n += 1
    const px = Number.parseFloat(t.price)
    const q = Number.parseFloat(t.quantity)
    if (!Number.isFinite(px) || !Number.isFinite(q) || q <= 0) continue
    const notional = px * q
    sumPxQty += notional
    sumQty += q
    if (high === null || px > high) high = px
    if (low === null || px < low) low = px
    if (maxNotional === null || notional > maxNotional) maxNotional = notional
  }

  const vwap = sumQty > 0 ? sumPxQty / sumQty : null

  return {
    tradeCount: n,
    vwap,
    sessionHigh: high,
    sessionLow: low,
    largestPrintNotional: maxNotional,
  }
}
