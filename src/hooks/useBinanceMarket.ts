import { useEffect, useRef, useState } from 'react'
import { mergeKlineIntoCandles } from '../lib/binance/klineMerge'
import {
  parseAggTrade,
  parseBookTicker,
  parseKline,
  parsePartialDepthWithStream,
} from '../lib/binance/parse'
import type { WorkerBatchMessage } from '../lib/binance/ingestWorkerTypes'
import { partialDepthContentKey } from '../lib/binance/partialDepthContentKey'
import { isDepthStreamId, symbolForStream } from '../lib/binance/streamSymbols'
import type {
  BookTop,
  ConnectionState,
  KlineTick,
  NormalizedTrade,
  PartialDepthBook,
} from '../lib/binance/types'
import type { CandlestickData } from 'lightweight-charts'

const DEFAULT_HOST = 'wss://stream.binance.com:9443'
/** Capped list length kept in React state (memory + render cost). */
const MAX_TRADES = 1_200
/**
 * When merging a batch, only check duplicates against this many newest rows in
 * `prev` (same order as merged array: newest first). Avoids O(prev.length) work
 * every animation frame, which was blowing heap/CPU under dev React profiling.
 */
const PREV_DEDUP_HEAD = 512
const DEPTH_INIT_PRIORITY_PAIRS_PER_FLUSH = 6
const DEPTH_PER_PAIR_QUOTA = 1
const DEPTH_MAX_STREAMS_PER_FLUSH = 48
const INITIAL_BACKOFF_MS = 1_000
const MAX_BACKOFF_MS = 30_000
const DEPTH_STALE_RECONNECT_MS = 6_000
const DEPTH_STALE_RECONNECT_COOLDOWN_MS = 15_000
/** Max depth streams to scan per 1s window for stale reconnect (direct Binance only). */
const STALE_DEPTH_SCAN_CAP = 64
/** Binance combined-stream practical limits (direct URL + stream count). */
const MAX_DIRECT_COMBINED_STREAMS = 200
const MAX_DIRECT_COMBINED_URL_LENGTH = 8000
const FANOUT_WS_DEFAULT = 'ws://127.0.0.1:8787/ws'
const MARKET_SOURCE = import.meta.env.VITE_MARKET_SOURCE ?? 'direct-binance'

type FanoutServerMessage =
  | {
      type: 'snapshot' | 'update'
      stream: string
      payload: unknown
      ts: number
    }
  | {
      type: 'health'
      upstreamConnected: boolean
      streamCount: number
      clientCount: number
      upstreamMsgsPerSec?: number
      upstreamMsgTotal?: number
      staleStreams?: Array<{ stream: string; staleForMs: number }>
      ts: number
    }
  | { type: 'pong'; ts: number }
  | { type: 'error'; reason: string; ts: number }

export type MarketStats = {
  totalMessages: number
  /** rAF/UI commits in the last completed 1s window. */
  flushesPerSec: number
  /** Raw WS messages in the last completed 1s window. */
  msgsPerSec: number
  reconnectCount: number
}

/** Last rAF flush coalescing stats (dev HUD); updated once per flush. */
export type IngestFlushMetrics = {
  lastWsMsgsInFlush: number
  lastTradeBufferLen: number
  emaWsMsgsPerFlush: number
  /** Worker batches received in the last completed 1s window. */
  workerBatchesPerSec: number
  /** Parsed payloads delivered by worker batches in the last completed 1s window. */
  workerParsedPerSec: number
  /** Raw messages parsed on main-thread fallback in the last completed 1s window. */
  fallbackParsedPerSec: number
  /** Number of pairs still waiting for first depth publication. */
  firstDepthPending: number
  /** Number of unique pairs served by last flush. */
  pairsServedPerFlush: number
  /** Remaining dirty depth streams not served in last flush. */
  depthBacklog: number
}

export type BackendHealth = {
  upstreamConnected: boolean
  streamCount: number
  clientCount: number
  upstreamMsgsPerSec: number
  upstreamMsgTotal: number
  staleStreams: Array<{ stream: string; staleForMs: number }>
}

function buildCombinedUrl(streams: string[], host: string): string {
  const path = streams.map((s) => encodeURIComponent(s)).join('/')
  return `${host.replace(/\/$/, '')}/stream?streams=${path}`
}

export function useBinanceMarket(
  streams: string[],
  options?: { wsHost?: string },
) {
  const host = options?.wsHost ?? DEFAULT_HOST
  const fanoutWsUrl = import.meta.env.VITE_FANOUT_WS_URL ?? FANOUT_WS_DEFAULT
  const useFanout = MARKET_SOURCE === 'backend-fanout'
  const streamsKey = streams.join(',')

  const [connection, setConnection] = useState<ConnectionState>('idle')
  const [trades, setTrades] = useState<NormalizedTrade[]>([])
  const [bookTopBySymbol, setBookTopBySymbol] = useState<
    Record<string, BookTop>
  >({})
  const [partialDepthByStream, setPartialDepthByStream] = useState<
    Record<string, PartialDepthBook>
  >({})
  const [candlesBySymbol, setCandlesBySymbol] = useState<
    Record<string, CandlestickData[]>
  >({})
  const [stats, setStats] = useState<MarketStats>({
    totalMessages: 0,
    flushesPerSec: 0,
    msgsPerSec: 0,
    reconnectCount: 0,
  })
  const [ingestMetrics, setIngestMetrics] = useState<IngestFlushMetrics>({
    lastWsMsgsInFlush: 0,
    lastTradeBufferLen: 0,
    emaWsMsgsPerFlush: 0,
    workerBatchesPerSec: 0,
    workerParsedPerSec: 0,
    fallbackParsedPerSec: 0,
    firstDepthPending: 0,
    pairsServedPerFlush: 0,
    depthBacklog: 0,
  })
  const [backendHealth, setBackendHealth] = useState<BackendHealth | null>(null)

  const pendingTradesRef = useRef<NormalizedTrade[]>([])
  const bookBySymbolRef = useRef(new Map<string, BookTop>())
  const dirtyBookSymbolsRef = useRef(new Set<string>())
  const lastPublishedBookIdBySymbolRef = useRef(new Map<string, number>())
  const depthByStreamRef = useRef(new Map<string, PartialDepthBook>())
  const depthPairByStreamRef = useRef(new Map<string, string>())
  const pendingDepthKeyByStreamRef = useRef(new Map<string, string>())
  const pendingFirstDepthHintByStreamRef = useRef(new Map<string, boolean>())
  const dirtyDepthStreamsRef = useRef(new Set<string>())
  const lastPublishedDepthKeyByStreamRef = useRef(new Map<string, string>())
  const initializedDepthPairsRef = useRef(new Set<string>())
  const depthPairRoundRobinRef = useRef(0)
  const pendingKlinesRef = useRef<KlineTick[]>([])

  const rafRef = useRef<number | null>(null)
  const scheduledRef = useRef(false)

  const totalMessagesRef = useRef(0)
  const msgsInSecondRef = useRef(0)
  const flushesInSecondRef = useRef(0)
  const secondStartRef = useRef(0)
  const reconnectsRef = useRef(0)
  const ingestSeqRef = useRef(0)
  const wsMsgsSinceFlushRef = useRef(0)
  const workerModeRef = useRef(false)
  const workerBatchesInSecondRef = useRef(0)
  const workerParsedInSecondRef = useRef(0)
  const fallbackParsedInSecondRef = useRef(0)
  const workerBatchesLastSecondRef = useRef(0)
  const workerParsedLastSecondRef = useRef(0)
  const fallbackParsedLastSecondRef = useRef(0)
  const lastFirstDepthPendingRef = useRef(0)
  const lastPairsServedRef = useRef(0)
  const lastDepthBacklogRef = useRef(0)
  const lastDepthSeenAtByStreamRef = useRef(new Map<string, number>())
  const lastDepthPublishedAtByStreamRef = useRef(new Map<string, number>())

  useEffect(() => {
    const streamsSnapshot = [...streams]
    pendingTradesRef.current = []
    bookBySymbolRef.current = new Map()
    dirtyBookSymbolsRef.current = new Set()
    lastPublishedBookIdBySymbolRef.current = new Map()
    depthByStreamRef.current = new Map()
    depthPairByStreamRef.current = new Map()
    pendingDepthKeyByStreamRef.current = new Map()
    pendingFirstDepthHintByStreamRef.current = new Map()
    dirtyDepthStreamsRef.current = new Set()
    lastPublishedDepthKeyByStreamRef.current = new Map()
    initializedDepthPairsRef.current = new Set()
    depthPairRoundRobinRef.current = 0
    lastDepthSeenAtByStreamRef.current = new Map()
    lastDepthPublishedAtByStreamRef.current = new Map()
    queueMicrotask(() => {
      setPartialDepthByStream({})
      setBookTopBySymbol({})
      setCandlesBySymbol({})
      setBackendHealth(null)
    })
    pendingKlinesRef.current = []

    let ws: WebSocket | null = null
    let parserWorker: Worker | null = null
    let activeConnectSeq = 0
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let closedByUser = false
    let backoff = INITIAL_BACKOFF_MS
    let lastStaleReconnectAt = 0

    const bumpSecondWindow = (now: number) => {
      if (secondStartRef.current === 0) secondStartRef.current = now
      if (now - secondStartRef.current >= 1000) {
        workerBatchesLastSecondRef.current = workerBatchesInSecondRef.current
        workerParsedLastSecondRef.current = workerParsedInSecondRef.current
        fallbackParsedLastSecondRef.current = fallbackParsedInSecondRef.current
        setStats({
          totalMessages: totalMessagesRef.current,
          flushesPerSec: flushesInSecondRef.current,
          msgsPerSec: msgsInSecondRef.current,
          reconnectCount: reconnectsRef.current,
        })
        msgsInSecondRef.current = 0
        flushesInSecondRef.current = 0
        workerBatchesInSecondRef.current = 0
        workerParsedInSecondRef.current = 0
        fallbackParsedInSecondRef.current = 0
        if (
          ws &&
          ws.readyState === WebSocket.OPEN &&
          now - lastStaleReconnectAt >= DEPTH_STALE_RECONNECT_COOLDOWN_MS
        ) {
          const depthStreams = streamsSnapshot.filter(isDepthStreamId)
          const watchStreams = depthStreams.slice(0, STALE_DEPTH_SCAN_CAP)
          let staleStream: string | null = null
          for (const stream of watchStreams) {
            const lastSeenAt = lastDepthSeenAtByStreamRef.current.get(stream) ?? 0
            if (lastSeenAt === 0) continue
            const staleForMs = Date.now() - lastSeenAt
            if (staleForMs >= DEPTH_STALE_RECONNECT_MS) {
              staleStream = stream
              break
            }
          }
          if (staleStream) {
            lastStaleReconnectAt = now
            try {
              ws.close()
            } catch {
              // Best-effort reconnect trigger.
            }
          }
        }
        secondStartRef.current = now
      }
    }

    const flush = () => {
      scheduledRef.current = false
      rafRef.current = null

      const wsIn = wsMsgsSinceFlushRef.current
      wsMsgsSinceFlushRef.current = 0

      const batch = pendingTradesRef.current
      const tradeBufferLen = batch.length
      pendingTradesRef.current = []
      const dirtyBookSymbols = dirtyBookSymbolsRef.current
      const dirtyDepthStreams = dirtyDepthStreamsRef.current
      const klinesFlush = pendingKlinesRef.current
      pendingKlinesRef.current = []

      const now = performance.now()
      flushesInSecondRef.current += 1
      bumpSecondWindow(now)

      if (batch.length > 0) {
        setTrades((prev) => {
          if (workerModeRef.current) {
            const incoming = batch.slice().reverse()
            return incoming.length + prev.length > MAX_TRADES
              ? [...incoming, ...prev].slice(0, MAX_TRADES)
              : [...incoming, ...prev]
          }
          const incoming = batch.slice().reverse()
          const scan = Math.min(PREV_DEDUP_HEAD, prev.length)
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
            deduped.length + prev.length > MAX_TRADES
              ? [...deduped, ...prev].slice(0, MAX_TRADES)
              : [...deduped, ...prev]
          return next
        })
      }

      if (dirtyBookSymbols.size > 0) {
        const symbols = [...dirtyBookSymbols]
        dirtyBookSymbols.clear()
        setBookTopBySymbol((prev) => {
          let next: Record<string, BookTop> | null = null
          for (const sym of symbols) {
            const b = bookBySymbolRef.current.get(sym)
            if (!b) continue
            const lastId = lastPublishedBookIdBySymbolRef.current.get(sym)
            if (lastId === b.updateId) continue
            lastPublishedBookIdBySymbolRef.current.set(sym, b.updateId)
            if (!next) next = { ...prev }
            next[sym] = b
          }
          return next ?? prev
        })
      }

      if (dirtyDepthStreams.size > 0) {
        const streams = [...dirtyDepthStreams]
        const streamsByPair = new Map<string, string[]>()
        const uninitializedPairs = new Set<string>()
        const initializedPairs = new Set<string>()
        for (const stream of streams) {
          const pair =
            depthPairByStreamRef.current.get(stream) ?? symbolForStream(stream)
          const arr = streamsByPair.get(pair)
          if (arr) arr.push(stream)
          else streamsByPair.set(pair, [stream])
          const hinted = pendingFirstDepthHintByStreamRef.current.get(stream)
          if (hinted || !initializedDepthPairsRef.current.has(pair)) {
            uninitializedPairs.add(pair)
          } else {
            initializedPairs.add(pair)
          }
        }

        const selectedStreams: string[] = []
        const pairsServed = new Set<string>()
        let selectedCount = 0

        for (const pair of uninitializedPairs) {
          if (pairsServed.size >= DEPTH_INIT_PRIORITY_PAIRS_PER_FLUSH) break
          const q = streamsByPair.get(pair)
          if (!q || q.length === 0) continue
          const take = q.splice(0, DEPTH_PER_PAIR_QUOTA)
          selectedStreams.push(...take)
          selectedCount += take.length
          pairsServed.add(pair)
          if (q.length === 0) streamsByPair.delete(pair)
          if (selectedCount >= DEPTH_MAX_STREAMS_PER_FLUSH) break
        }

        const rrPairs = [...initializedPairs]
        if (rrPairs.length > 0 && selectedCount < DEPTH_MAX_STREAMS_PER_FLUSH) {
          const start = depthPairRoundRobinRef.current % rrPairs.length
          const order = [...rrPairs.slice(start), ...rrPairs.slice(0, start)]
          let progressed = true
          while (
            progressed &&
            selectedCount < DEPTH_MAX_STREAMS_PER_FLUSH &&
            streamsByPair.size > 0
          ) {
            progressed = false
            for (const pair of order) {
              const q = streamsByPair.get(pair)
              if (!q || q.length === 0) continue
              const take = q.splice(0, DEPTH_PER_PAIR_QUOTA)
              if (take.length === 0) continue
              selectedStreams.push(...take)
              selectedCount += take.length
              pairsServed.add(pair)
              progressed = true
              if (q.length === 0) streamsByPair.delete(pair)
              if (selectedCount >= DEPTH_MAX_STREAMS_PER_FLUSH) break
            }
          }
          depthPairRoundRobinRef.current = (start + 1) % rrPairs.length
        }

        setPartialDepthByStream((prev) => {
          let next: Record<string, PartialDepthBook> | null = null
          for (const stream of selectedStreams) {
            const book = depthByStreamRef.current.get(stream)
            if (!book) {
              continue
            }
            const pair =
              depthPairByStreamRef.current.get(stream) ?? symbolForStream(stream)
            const key =
              pendingDepthKeyByStreamRef.current.get(stream) ??
              partialDepthContentKey(book)
            const lastKey = lastPublishedDepthKeyByStreamRef.current.get(stream)
            dirtyDepthStreams.delete(stream)
            pendingFirstDepthHintByStreamRef.current.delete(stream)
            if (lastKey === key) {
              continue
            }
            lastPublishedDepthKeyByStreamRef.current.set(stream, key)
            initializedDepthPairsRef.current.add(pair)
            lastDepthPublishedAtByStreamRef.current.set(stream, Date.now())
            if (!next) next = { ...prev }
            next[stream] = book
          }
          for (const stream of selectedStreams) {
            pendingDepthKeyByStreamRef.current.delete(stream)
          }
          const pendingPairs = new Set<string>()
          for (const stream of dirtyDepthStreams) {
            const pair =
              depthPairByStreamRef.current.get(stream) ?? symbolForStream(stream)
            if (!initializedDepthPairsRef.current.has(pair)) pendingPairs.add(pair)
          }
          lastFirstDepthPendingRef.current = pendingPairs.size
          lastPairsServedRef.current = pairsServed.size
          lastDepthBacklogRef.current = dirtyDepthStreams.size
          return next ?? prev
        })
      }

      if (klinesFlush.length > 0) {
        setCandlesBySymbol((prev) => {
          const next = { ...prev }
          for (const k of klinesFlush) {
            const sym = k.symbol
            next[sym] = mergeKlineIntoCandles(next[sym] ?? [], k)
          }
          return next
        })
      }

      if (import.meta.env.DEV) {
        setIngestMetrics((prev) => ({
          lastWsMsgsInFlush: wsIn,
          lastTradeBufferLen: tradeBufferLen,
          emaWsMsgsPerFlush:
            prev.emaWsMsgsPerFlush === 0
              ? wsIn
              : prev.emaWsMsgsPerFlush * 0.85 + wsIn * 0.15,
          workerBatchesPerSec: workerBatchesLastSecondRef.current,
          workerParsedPerSec: workerParsedLastSecondRef.current,
          fallbackParsedPerSec: fallbackParsedLastSecondRef.current,
          firstDepthPending: lastFirstDepthPendingRef.current,
          pairsServedPerFlush: lastPairsServedRef.current,
          depthBacklog: lastDepthBacklogRef.current,
        }))
      }
    }

    const scheduleFlush = () => {
      if (scheduledRef.current) return
      scheduledRef.current = true
      rafRef.current = requestAnimationFrame(flush)
    }

    const clearReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
    }

    const ingestEnvelopeFallback = (
      envelope: unknown,
      source: 'worker' | 'fallback',
    ) => {
      const trade = parseAggTrade(envelope)
      if (trade) {
        return ingestBatch(
          {
            kind: 'batch',
            trades: [trade],
            books: [],
            depths: [],
            klines: [],
          },
          source,
        )
      }
      const book = parseBookTicker(envelope)
      if (book) {
        return ingestBatch(
          {
            kind: 'batch',
            trades: [],
            books: [{ pairKey: book.symbol.toUpperCase(), book }],
            depths: [],
            klines: [],
          },
          source,
        )
      }
      const depthLabeled = parsePartialDepthWithStream(envelope)
      if (depthLabeled) {
        return ingestBatch(
          {
            kind: 'batch',
            trades: [],
            books: [],
            depths: [
              {
                pairKey: symbolForStream(depthLabeled.stream),
                stream: depthLabeled.stream,
                book: depthLabeled.book,
                key: partialDepthContentKey(depthLabeled.book),
                firstDepthHint: false,
              },
            ],
            klines: [],
          },
          source,
        )
      }
      const kline = parseKline(envelope)
      if (kline) {
        return ingestBatch(
          {
            kind: 'batch',
            trades: [],
            books: [],
            depths: [],
            klines: [kline],
          },
          source,
        )
      }
    }

    const ingestBatch = (
      batch: WorkerBatchMessage,
      source: 'worker' | 'fallback',
    ) => {
      const parsedCount =
        batch.trades.length +
        batch.books.length +
        batch.depths.length +
        batch.klines.length
      if (source === 'worker') {
        workerBatchesInSecondRef.current += 1
        workerParsedInSecondRef.current += parsedCount
      } else {
        fallbackParsedInSecondRef.current += parsedCount
      }
      if (batch.trades.length > 0) {
        for (const trade of batch.trades) {
          pendingTradesRef.current.push({
            ...trade,
            ingestSeq: ++ingestSeqRef.current,
          })
        }
      }
      if (batch.books.length > 0) {
        for (const book of batch.books) {
          bookBySymbolRef.current.set(book.book.symbol, book.book)
          dirtyBookSymbolsRef.current.add(book.book.symbol)
        }
      }
      if (batch.depths.length > 0) {
        for (const depth of batch.depths) {
          depthPairByStreamRef.current.set(depth.stream, depth.pairKey)
          lastDepthSeenAtByStreamRef.current.set(depth.stream, Date.now())
          depthByStreamRef.current.set(depth.stream, depth.book)
          pendingDepthKeyByStreamRef.current.set(depth.stream, depth.key)
          pendingFirstDepthHintByStreamRef.current.set(
            depth.stream,
            depth.firstDepthHint,
          )
          dirtyDepthStreamsRef.current.add(depth.stream)
        }
      }
      if (batch.klines.length > 0) {
        pendingKlinesRef.current.push(...batch.klines)
      }
      scheduleFlush()
    }

    const connect = () => {
      if (closedByUser) return
      activeConnectSeq += 1
      const thisConnectSeq = activeConnectSeq
      setConnection('connecting')
      const url = useFanout
        ? fanoutWsUrl
        : buildCombinedUrl(streamsSnapshot, host)
      if (!useFanout) {
        if (streamsSnapshot.length > MAX_DIRECT_COMBINED_STREAMS) {
          if (import.meta.env.DEV) {
            console.error(
              '[useBinanceMarket] Too many streams for combined URL:',
              streamsSnapshot.length,
              'max',
              MAX_DIRECT_COMBINED_STREAMS,
            )
          }
          setConnection('error')
          return
        }
        if (url.length > MAX_DIRECT_COMBINED_URL_LENGTH) {
          if (import.meta.env.DEV) {
            console.error(
              '[useBinanceMarket] Combined WebSocket URL too long:',
              url.length,
              'max',
              MAX_DIRECT_COMBINED_URL_LENGTH,
            )
          }
          setConnection('error')
          return
        }
      }
      ws = new WebSocket(url)
      if (parserWorker) {
        parserWorker.terminate()
        parserWorker = null
      }
      if (typeof Worker !== 'undefined') {
        workerModeRef.current = true
        parserWorker = new Worker(
          new URL('../workers/marketParse.worker.ts', import.meta.url),
          { type: 'module' },
        )
        parserWorker.onmessage = (ev: MessageEvent<WorkerBatchMessage>) => {
          ingestBatch(ev.data, 'worker')
        }
        parserWorker.onerror = () => {
          parserWorker?.terminate()
          parserWorker = null
          workerModeRef.current = false
        }
        parserWorker.onmessageerror = () => {
          parserWorker?.terminate()
          parserWorker = null
          workerModeRef.current = false
        }
      } else {
        workerModeRef.current = false
      }

      ws.onopen = () => {
        if (thisConnectSeq !== activeConnectSeq) return
        backoff = INITIAL_BACKOFF_MS
        setConnection('open')
        if (useFanout && ws) {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              streams: streamsSnapshot,
            }),
          )
        }
      }

      const ingestRawTextFallback = (rawText: string) => {
        // Fallback path when Web Worker is unavailable.
        let parsed: unknown
        try {
          parsed = JSON.parse(rawText)
        } catch {
          return
        }
        return ingestEnvelopeFallback(parsed, 'fallback')
      }

      ws.onmessage = (ev) => {
        if (useFanout) {
          if (typeof ev.data !== 'string') return
          let msg: FanoutServerMessage | null = null
          try {
            msg = JSON.parse(ev.data) as FanoutServerMessage
          } catch {
            return
          }
          if (!msg) return
          if (msg.type === 'health') {
            setConnection(msg.upstreamConnected ? 'open' : 'connecting')
            setBackendHealth({
              upstreamConnected: msg.upstreamConnected,
              streamCount: msg.streamCount,
              clientCount: msg.clientCount,
              upstreamMsgsPerSec: msg.upstreamMsgsPerSec ?? 0,
              upstreamMsgTotal: msg.upstreamMsgTotal ?? 0,
              staleStreams: msg.staleStreams ?? [],
            })
            return
          }
          if (msg.type === 'error' || msg.type === 'pong') return
          wsMsgsSinceFlushRef.current += 1
          totalMessagesRef.current += 1
          msgsInSecondRef.current += 1
          const now = performance.now()
          bumpSecondWindow(now)
          const envelope = { stream: msg.stream, data: msg.payload }
          const combinedFrame = JSON.stringify(envelope)
          if (parserWorker) {
            parserWorker.postMessage(combinedFrame)
          } else if (workerModeRef.current) {
            parserWorker = new Worker(
              new URL('../workers/marketParse.worker.ts', import.meta.url),
              { type: 'module' },
            )
            parserWorker.onmessage = (mEv: MessageEvent<WorkerBatchMessage>) => {
              ingestBatch(mEv.data, 'worker')
            }
            parserWorker.onerror = () => {
              parserWorker?.terminate()
              parserWorker = null
              workerModeRef.current = false
            }
            parserWorker.onmessageerror = () => {
              parserWorker?.terminate()
              parserWorker = null
              workerModeRef.current = false
            }
            parserWorker.postMessage(combinedFrame)
          } else {
            ingestEnvelopeFallback(envelope, 'fallback')
          }
          return
        }
        wsMsgsSinceFlushRef.current += 1
        totalMessagesRef.current += 1
        msgsInSecondRef.current += 1
        const now = performance.now()
        bumpSecondWindow(now)

        if (parserWorker && typeof ev.data === 'string') {
          parserWorker.postMessage(ev.data)
          return
        }
        if (!parserWorker && workerModeRef.current) {
          parserWorker = new Worker(
            new URL('../workers/marketParse.worker.ts', import.meta.url),
            { type: 'module' },
          )
          parserWorker.onmessage = (mEv: MessageEvent<WorkerBatchMessage>) => {
            ingestBatch(mEv.data, 'worker')
          }
          parserWorker.onerror = () => {
            parserWorker?.terminate()
            parserWorker = null
            workerModeRef.current = false
          }
          parserWorker.onmessageerror = () => {
            parserWorker?.terminate()
            parserWorker = null
            workerModeRef.current = false
          }
          if (typeof ev.data === 'string') {
            parserWorker.postMessage(ev.data)
            return
          }
        }
        if (typeof ev.data === 'string') {
          ingestRawTextFallback(ev.data)
          return
        }
        if (ev.data instanceof Blob) {
          void ev.data.text().then((txt) => ingestRawTextFallback(txt))
        }
      }

      ws.onerror = () => {
        if (thisConnectSeq !== activeConnectSeq) return
        setConnection('error')
      }

      ws.onclose = () => {
        if (thisConnectSeq !== activeConnectSeq) return
        ws = null
        if (parserWorker) {
          parserWorker.terminate()
          parserWorker = null
        }
        setConnection('closed')
        if (closedByUser) return
        reconnectsRef.current += 1
        setStats((s) => ({ ...s, reconnectCount: reconnectsRef.current }))
        clearReconnect()
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
          connect()
        }, backoff)
      }
    }

    connect()

    return () => {
      closedByUser = true
      if (parserWorker) {
        parserWorker.terminate()
        parserWorker = null
      }
      clearReconnect()
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      scheduledRef.current = false
      if (ws) {
        ws.onopen = null
        ws.onmessage = null
        ws.onerror = null
        ws.onclose = null
        if (
          ws.readyState === WebSocket.OPEN ||
          ws.readyState === WebSocket.CONNECTING
        ) {
          try {
            ws.close()
          } catch {
            // Best-effort cleanup during teardown.
          }
        }
      }
      ws = null
    }
  }, [fanoutWsUrl, host, streams, streamsKey, useFanout])

  return {
    connection,
    trades,
    bookTopBySymbol,
    partialDepthByStream,
    candlesBySymbol,
    stats,
    ingestMetrics,
    backendHealth,
  }
}
