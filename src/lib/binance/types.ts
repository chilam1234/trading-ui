/** Fields from Binance @aggTrade before client metadata. */
export type AggTradeFields = {
  id: string
  symbol: string
  price: string
  quantity: string
  /** True if aggressive side was a buy (taker bought). */
  buyerIsTaker: boolean
  eventTime: number
}

/** Row in the tape: exchange fields + unique client key for React. */
export type NormalizedTrade = AggTradeFields & {
  /** Monotonic client id so list keys stay unique even if exchange ids repeat. */
  ingestSeq: number
}

export type BookTop = {
  symbol: string
  bestBid: string
  bestBidQty: string
  bestAsk: string
  bestAskQty: string
  updateId: number
}

/** Top-of-book levels from `@depth<N>` / `@depth<N>@100ms` (full snapshot each message). */
export type DepthLevel = { price: string; quantity: string }

export type PartialDepthBook = {
  /** Numeric form when it fits `Number`; may lose precision for very large IDs. */
  lastUpdateId: number
  /** Exact string from JSON for display + dedup (avoids precision loss). */
  lastUpdateIdStr: string
  bids: DepthLevel[]
  asks: DepthLevel[]
}

/** Normalized Binance @kline `k` object (one bar update). */
export type KlineTick = {
  /** Spot symbol, uppercase (e.g. BTCUSDT). */
  symbol: string
  interval: string
  /** Candle open time (ms), maps to chart `time` as seconds. */
  openTime: number
  isClosed: boolean
  open: string
  high: string
  low: string
  close: string
}

export type ConnectionState =
  | 'idle'
  | 'connecting'
  | 'open'
  | 'closed'
  | 'error'
