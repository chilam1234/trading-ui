import {
  parseAggTrade,
  parseBookTicker,
  parseKline,
  parsePartialDepthWithStream,
} from '../lib/binance/parse'
import { partialDepthContentKey } from '../lib/binance/partialDepthContentKey'
import type {
  WorkerBatchMessage,
  WorkerDepthPatch,
} from '../lib/binance/ingestWorkerTypes'

const RECENT_TRADE_KEYS_CAP = 8_192
const recentTradeKeys = new Set<string>()
const recentTradeQueue: string[] = []

const pendingTrades: import('../lib/binance/types').AggTradeFields[] = []
const pendingBooks = new Map<string, { pairKey: string; book: import('../lib/binance/types').BookTop }>()
const pendingDepths = new Map<string, WorkerDepthPatch>()
const pendingKlines: import('../lib/binance/types').KlineTick[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
const BATCH_WINDOW_MS = 16
const seenDepthStreams = new Set<string>()

function pairKeyForStream(stream: string): string {
  const at = stream.indexOf('@')
  return (at > 0 ? stream.slice(0, at) : stream).toUpperCase()
}

function rememberTradeKey(k: string) {
  if (recentTradeKeys.has(k)) return false
  recentTradeKeys.add(k)
  recentTradeQueue.push(k)
  if (recentTradeQueue.length > RECENT_TRADE_KEYS_CAP) {
    const evicted = recentTradeQueue.shift()
    if (evicted) recentTradeKeys.delete(evicted)
  }
  return true
}

function flushBatch() {
  flushTimer = null
  if (
    pendingTrades.length === 0 &&
    pendingBooks.size === 0 &&
    pendingDepths.size === 0 &&
    pendingKlines.length === 0
  ) {
    return
  }
  const out: WorkerBatchMessage = {
    kind: 'batch',
    trades: pendingTrades.splice(0),
    books: [...pendingBooks.values()],
    depths: [...pendingDepths.values()],
    klines: pendingKlines.splice(0),
  }
  pendingBooks.clear()
  pendingDepths.clear()
  self.postMessage(out)
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flushBatch, BATCH_WINDOW_MS)
}

/** Accepts Binance combined-stream JSON or the same `{ stream, data }` shape built from fanout `snapshot`/`update`. */
self.onmessage = (ev: MessageEvent<string>) => {
  const rawText = ev.data
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return
  }

  const trade = parseAggTrade(parsed)
  if (trade) {
    const key = `${trade.symbol}:${trade.id}`
    if (rememberTradeKey(key)) pendingTrades.push(trade)
    scheduleFlush()
    return
  }

  const book = parseBookTicker(parsed)
  if (book) {
    pendingBooks.set(book.symbol, { pairKey: book.symbol.toUpperCase(), book })
    scheduleFlush()
    return
  }

  const depth = parsePartialDepthWithStream(parsed)
  if (depth) {
    const firstDepthHint = !seenDepthStreams.has(depth.stream)
    seenDepthStreams.add(depth.stream)
    pendingDepths.set(depth.stream, {
      pairKey: pairKeyForStream(depth.stream),
      stream: depth.stream,
      book: depth.book,
      key: partialDepthContentKey(depth.book),
      firstDepthHint,
    })
    scheduleFlush()
    return
  }

  const kline = parseKline(parsed)
  if (kline) {
    pendingKlines.push(kline)
    scheduleFlush()
  }
}
