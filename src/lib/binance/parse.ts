import type {
  AggTradeFields,
  BookTop,
  DepthLevel,
  KlineTick,
  PartialDepthBook,
} from './types'
import { symbolForStream } from './streamSymbols'

type UnknownRecord = Record<string, unknown>

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === 'object' && v !== null
}

/** Combined stream envelope: `{ stream, data }`. */
export function unwrapStreamPayload(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  if (typeof raw.stream === 'string' && 'data' in raw) return raw.data
  return raw
}

/** Multiplex stream id from the outer envelope (e.g. `btcusdt@depth10@100ms`). */
export function parseCombinedStreamName(raw: unknown): string | null {
  if (!isRecord(raw)) return null
  const s = raw.stream
  return typeof s === 'string' && s.length > 0 ? s : null
}

/** Binance aggTrade: https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams */
export function parseAggTrade(raw: unknown): AggTradeFields | null {
  const o = unwrapStreamPayload(raw)
  if (!isRecord(o)) return null
  if (o.e !== 'aggTrade') return null
  const id = o.a
  const symbol = o.s
  const price = o.p
  const quantity = o.q
  const eventTime = o.E
  const buyerIsMaker = o.m
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    typeof symbol !== 'string' ||
    typeof price !== 'string' ||
    typeof quantity !== 'string' ||
    typeof eventTime !== 'number' ||
    typeof buyerIsMaker !== 'boolean'
  ) {
    return null
  }
  return {
    id: String(id),
    symbol,
    price,
    quantity,
    buyerIsTaker: !buyerIsMaker,
    eventTime,
  }
}

/** Individual symbol book ticker (best bid/ask). */
export function parseBookTicker(raw: unknown): BookTop | null {
  const o = unwrapStreamPayload(raw)
  if (!isRecord(o)) return null
  const u = o.u
  const s = o.s
  const b = o.b
  const B = o.B
  const a = o.a
  const A = o.A
  if (
    typeof u !== 'number' ||
    typeof s !== 'string' ||
    typeof b !== 'string' ||
    typeof B !== 'string' ||
    typeof a !== 'string' ||
    typeof A !== 'string'
  ) {
    return null
  }
  return {
    symbol: s,
    bestBid: b,
    bestBidQty: B,
    bestAsk: a,
    bestAskQty: A,
    updateId: u,
  }
}

function parseLevelRow(row: unknown): DepthLevel | null {
  if (!Array.isArray(row) || row.length < 2) return null
  const price = row[0]
  const quantity = row[1]
  if (typeof price !== 'string' || typeof quantity !== 'string') return null
  return { price, quantity }
}

/**
 * Partial depth snapshot (not diff `depthUpdate`).
 * @see https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams
 */
export function parsePartialDepth(raw: unknown): PartialDepthBook | null {
  const o = unwrapStreamPayload(raw)
  if (!isRecord(o)) return null
  if (o.e === 'depthUpdate') return null

  const rawId = o.lastUpdateId
  let lastUpdateIdStr: string
  if (typeof rawId === 'number' && Number.isFinite(rawId)) {
    lastUpdateIdStr = String(Math.trunc(rawId))
  } else if (typeof rawId === 'string') {
    lastUpdateIdStr = rawId.trim()
  } else {
    return null
  }
  if (!lastUpdateIdStr) return null

  const bids = o.bids
  const asks = o.asks
  if (!Array.isArray(bids) || !Array.isArray(asks)) {
    return null
  }

  const lastUpdateId = Number(lastUpdateIdStr)
  const lastUpdateIdNum = Number.isFinite(lastUpdateId) ? lastUpdateId : 0

  const bidLevels: DepthLevel[] = []
  for (const row of bids) {
    const lv = parseLevelRow(row)
    if (lv) bidLevels.push(lv)
  }
  const askLevels: DepthLevel[] = []
  for (const row of asks) {
    const lv = parseLevelRow(row)
    if (lv) askLevels.push(lv)
  }
  if (bidLevels.length === 0 && askLevels.length === 0) return null

  return {
    lastUpdateId: lastUpdateIdNum,
    lastUpdateIdStr,
    bids: bidLevels,
    asks: askLevels,
  }
}

const DEPTH_STREAM_FALLBACK = 'depth'

/** Partial depth plus multiplex stream key (one book per `@depth*` subscription). */
export function parsePartialDepthWithStream(
  raw: unknown,
): { stream: string; book: PartialDepthBook } | null {
  const book = parsePartialDepth(raw)
  if (!book) return null
  const rawName = parseCombinedStreamName(raw) ?? DEPTH_STREAM_FALLBACK
  /** Match subscription multiplex ids (lowercase) so Map/React keys do not split by casing. */
  const stream = rawName.toLowerCase()
  return { stream, book }
}

/** Kline stream `e === 'kline'`. Symbol: prefer payload `s`, else multiplex `stream` on the same envelope (fanout / combined). */
export function parseKline(raw: unknown): KlineTick | null {
  const o = unwrapStreamPayload(raw)
  if (!isRecord(o)) return null
  if (o.e !== 'kline') return null
  const symRaw = o.s
  let symbol: string | undefined
  if (typeof symRaw === 'string' && symRaw.length > 0) {
    symbol = symRaw.toUpperCase()
  }
  if (!symbol) {
    const stream = parseCombinedStreamName(raw)
    if (stream) symbol = symbolForStream(stream)
  }
  if (!symbol) return null
  const k = o.k
  if (!isRecord(k)) return null
  const i = k.i
  const t = k.t
  const x = k.x
  const open = k.o
  const high = k.h
  const low = k.l
  const close = k.c
  if (
    typeof i !== 'string' ||
    typeof t !== 'number' ||
    typeof x !== 'boolean' ||
    typeof open !== 'string' ||
    typeof high !== 'string' ||
    typeof low !== 'string' ||
    typeof close !== 'string'
  ) {
    return null
  }
  return {
    symbol,
    interval: i,
    openTime: t,
    isClosed: x,
    open,
    high,
    low,
    close,
  }
}
