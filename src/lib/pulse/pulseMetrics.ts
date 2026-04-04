import type { BookTop, NormalizedTrade, PartialDepthBook } from '../binance/types'

export type PulseMetrics = {
  mid: number | null
  spread: number | null
  spreadBps: number | null
  /** −1 = sell-heavy … +1 = buy-heavy (by taker volume in window). */
  flowSkew: number
  buyVol: number
  sellVol: number
  tradesInWindow: number
  /** Top-`k` notional bid vs ask imbalance, −1 … +1. */
  depthSkew: number
  depthBidNotional: number
  depthAskNotional: number
  hasDepth: boolean
}

const DEFAULT_FLOW_WINDOW = 120
const DEFAULT_DEPTH_LEVELS = 10

function parsePx(s: string): number | null {
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function sumNotionalTop(
  depth: PartialDepthBook,
  side: 'bids' | 'asks',
  k: number,
): number {
  const rows = depth[side]
  let s = 0
  const n = Math.min(k, rows.length)
  for (let i = 0; i < n; i++) {
    const row = rows[i]!
    const p = Number.parseFloat(row.price)
    const q = Number.parseFloat(row.quantity)
    if (Number.isFinite(p) && Number.isFinite(q) && q >= 0) s += p * q
  }
  return s
}

/**
 * Top-of-book mid/spread, short-window aggressive flow skew, and top-`k` book notional imbalance.
 */
export function computePulseMetrics(
  book: BookTop | null,
  trades: NormalizedTrade[],
  symbolUpper: string,
  flowWindow: number = DEFAULT_FLOW_WINDOW,
  depth: PartialDepthBook | null = null,
  depthTopLevels: number = DEFAULT_DEPTH_LEVELS,
): PulseMetrics {
  const sym = symbolUpper.toUpperCase()
  let mid: number | null = null
  let spread: number | null = null
  let spreadBps: number | null = null

  if (book) {
    const bid = parsePx(book.bestBid)
    const ask = parsePx(book.bestAsk)
    if (bid !== null && ask !== null && ask >= bid) {
      spread = ask - bid
      mid = (bid + ask) / 2
      if (mid > 0 && spread >= 0) {
        spreadBps = (spread / mid) * 10_000
      }
    }
  }

  let buyVol = 0
  let sellVol = 0
  let matched = 0
  const win = Math.max(1, flowWindow)
  for (let i = 0; i < trades.length && matched < win; i++) {
    const t = trades[i]
    if (!t || t.symbol.toUpperCase() !== sym) continue
    matched += 1
    const q = Number.parseFloat(t.quantity)
    if (!Number.isFinite(q) || q <= 0) continue
    if (t.buyerIsTaker) buyVol += q
    else sellVol += q
  }

  const total = buyVol + sellVol
  const flowSkew =
    total > 0 ? (buyVol - sellVol) / total : 0

  const k = Math.max(1, depthTopLevels)
  let depthBidNotional = 0
  let depthAskNotional = 0
  let depthSkew = 0
  let hasDepth = false

  if (depth && (depth.bids.length > 0 || depth.asks.length > 0)) {
    hasDepth = true
    depthBidNotional = sumNotionalTop(depth, 'bids', k)
    depthAskNotional = sumNotionalTop(depth, 'asks', k)
    const dn = depthBidNotional + depthAskNotional
    depthSkew = dn > 0 ? (depthBidNotional - depthAskNotional) / dn : 0
  }

  return {
    mid,
    spread,
    spreadBps,
    flowSkew,
    buyVol,
    sellVol,
    tradesInWindow: matched,
    depthSkew,
    depthBidNotional,
    depthAskNotional,
    hasDepth,
  }
}
