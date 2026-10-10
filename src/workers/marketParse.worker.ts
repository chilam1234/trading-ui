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
/** If main thread is slow, worker queues can grow without bound — cap + flush early. */
const MAX_PENDING_TRADES_WORKER = 2_500
const MAX_PENDING_KLINES_WORKER = 400
/**
 * postMessage uses structured clone; one giant batch can throw DataCloneError / OOM under pressure.
 */
const MAX_TRADES_PER_POST = 200
const MAX_KLINES_PER_POST = 200
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

  const books = [...pendingBooks.values()]
  pendingBooks.clear()
  const depths = [...pendingDepths.values()]
  pendingDepths.clear()
  const klinesAll = pendingKlines.splice(0)

  const tradeChunks: import('../lib/binance/types').AggTradeFields[][] = []
  while (pendingTrades.length > 0) {
    tradeChunks.push(pendingTrades.splice(0, MAX_TRADES_PER_POST))
  }
  if (tradeChunks.length === 0) {
    tradeChunks.push([])
  }

  const klineChunks: import('../lib/binance/types').KlineTick[][] = []
  for (let i = 0; i < klinesAll.length; i += MAX_KLINES_PER_POST) {
    klineChunks.push(klinesAll.slice(i, i + MAX_KLINES_PER_POST))
  }
  if (klineChunks.length === 0) {
    klineChunks.push([])
  }

  const rounds = Math.max(tradeChunks.length, klineChunks.length)
  for (let i = 0; i < rounds; i++) {
    const out: WorkerBatchMessage = {
      kind: 'batch',
      trades: tradeChunks[i] ?? [],
      books: i === 0 ? books : [],
      depths: i === 0 ? depths : [],
      klines: klineChunks[i] ?? [],
    }
    self.postMessage(out)
  }
}

function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(flushBatch, BATCH_WINDOW_MS)
}

function scheduleFlushOrDrainNow() {
  if (
    pendingTrades.length >= MAX_PENDING_TRADES_WORKER ||
    pendingKlines.length >= MAX_PENDING_KLINES_WORKER
  ) {
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    flushBatch()
    return
  }
  scheduleFlush()
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
    if (pendingTrades.length > MAX_PENDING_TRADES_WORKER) {
      pendingTrades.splice(0, pendingTrades.length - MAX_PENDING_TRADES_WORKER)
    }
    scheduleFlushOrDrainNow()
    return
  }

  const book = parseBookTicker(parsed)
  if (book) {
    pendingBooks.set(book.symbol, { pairKey: book.symbol.toUpperCase(), book })
    scheduleFlushOrDrainNow()
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
    scheduleFlushOrDrainNow()
    return
  }

  const kline = parseKline(parsed)
  if (kline) {
    pendingKlines.push(kline)
    if (pendingKlines.length > MAX_PENDING_KLINES_WORKER) {
      pendingKlines.splice(0, pendingKlines.length - MAX_PENDING_KLINES_WORKER)
    }
    scheduleFlushOrDrainNow()
  }
}
