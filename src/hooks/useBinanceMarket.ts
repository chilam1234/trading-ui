import { useEffect, useRef, useState } from 'react'
import { mergeKlineIntoCandles } from '../lib/binance/klineMerge'
import type { WorkerBatchMessage } from '../lib/binance/ingestWorkerTypes'
import { isDepthStreamId, symbolForStream } from '../lib/binance/streamSymbols'
import type {
  BookTop,
  ConnectionState,
  KlineTick,
  NormalizedTrade,
  PartialDepthBook,
} from '../lib/binance/types'
import type { CandlestickData } from 'lightweight-charts'
import { applyPartialDepthFlush } from './useBinanceMarket/applyPartialDepthFlush'
import { buildCombinedUrl } from './useBinanceMarket/buildCombinedUrl'
import { selectDepthStreamsForFlush } from './useBinanceMarket/depthFlushSelection'
import { createMarketParseWorker } from './useBinanceMarket/createMarketParseWorker'
import { tryEnvelopeToWorkerBatch } from './useBinanceMarket/envelopeToWorkerBatch'
import { filterRecordKeepingKeys } from './useBinanceMarket/filterRecordByAllowlist'
import type { FanoutServerMessage } from './useBinanceMarket/fanoutTypes'
import { mergeTradeBatchIntoPrev } from './useBinanceMarket/mergeTradesBatch'
import { coalesceKlines } from '../lib/render/coalesceKlines'
import {
  CATCHUP_FLUSH_MIN_MS,
  DEFAULT_HOST,
  DEPTH_STALE_RECONNECT_COOLDOWN_MS,
  DEPTH_STALE_RECONNECT_MS,
  FANOUT_WS_DEFAULT,
  INITIAL_BACKOFF_MS,
  MARKET_SOURCE,
  MAX_BACKOFF_MS,
  MAX_DIRECT_COMBINED_STREAMS,
  MAX_DIRECT_COMBINED_URL_LENGTH,
  MAX_TRADES,
  PENDING_KLINES_FLUSH_NOW,
  PENDING_TRADES_FLUSH_NOW,
  PENDING_TRADES_SHED_HARD_CAP,
  PREV_DEDUP_HEAD,
  RAF_GAP_SHED_MS,
  STALE_DEPTH_SCAN_CAP,
  WS_MSGS_FLUSH_NOW,
} from './useBinanceMarket/marketIngestConstants'
import type {
  BackendHealth,
  IngestFlushMetrics,
  MarketStats,
} from './useBinanceMarket/marketTypes'
import { recordRawWsMessageAndCoalesceFlush } from './useBinanceMarket/recordRawWsMessageCoalescing'
import { pruneIngestRefMaps } from './useBinanceMarket/pruneIngestRefMaps'
import { computeStreamAllowlists } from './useBinanceMarket/streamAllowlists'

export type { BackendHealth, IngestFlushMetrics, MarketStats } from './useBinanceMarket/marketTypes'

export function useBinanceMarket(
  streams: string[],
  options?: { wsHost?: string; omitKlineState?: boolean },
) {
  const omitKlineState = options?.omitKlineState ?? false
  const host = options?.wsHost ?? import.meta.env.VITE_BINANCE_HOST ?? DEFAULT_HOST
  const fanoutWsUrl = import.meta.env.VITE_FANOUT_WS_URL ?? FANOUT_WS_DEFAULT
  const useFanout = MARKET_SOURCE === 'backend-fanout'
  const streamsKey = streams.join(',')
  // Latest streams by ref: the effect must re-subscribe when stream *content*
  // changes (streamsKey), not when the caller passes a new array with the same
  // contents. Keeping `streams` in the dep list defeated `streamsKey` entirely —
  // any parent handing down a fresh array tore the socket down and reconnected.
  const streamsRef = useRef(streams)
  streamsRef.current = streams

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
  const lastFlushAtRef = useRef(0)
  const lastCatchupFlushAtRef = useRef(0)
  const lastIngestMetricsUiAtRef = useRef(0)

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
    const streamsSnapshot = [...streamsRef.current]
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

      const now = performance.now()
      const gap =
        lastFlushAtRef.current === 0 ? 0 : now - lastFlushAtRef.current
      lastFlushAtRef.current = now
      const shedding = gap > RAF_GAP_SHED_MS

      const wsIn = wsMsgsSinceFlushRef.current
      wsMsgsSinceFlushRef.current = 0

      let batch = pendingTradesRef.current
      pendingTradesRef.current = []
      if (shedding && batch.length > PENDING_TRADES_SHED_HARD_CAP) {
        batch = batch.slice(batch.length - PENDING_TRADES_SHED_HARD_CAP)
      }
      const tradeBufferLen = batch.length

      const dirtyBookSymbols = dirtyBookSymbolsRef.current
      const dirtyDepthStreams = dirtyDepthStreamsRef.current
      let klinesFlush = pendingKlinesRef.current
      pendingKlinesRef.current = []
      if (shedding && klinesFlush.length > 1) {
        klinesFlush = coalesceKlines(klinesFlush)
      }

      flushesInSecondRef.current += 1
      bumpSecondWindow(now)

      if (batch.length > 0) {
        setTrades((prev) =>
          mergeTradeBatchIntoPrev(prev, batch, {
            workerMode: workerModeRef.current,
            maxTrades: MAX_TRADES,
            prevDedupHead: PREV_DEDUP_HEAD,
          }),
        )
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
        let streams = [...dirtyDepthStreams]
        if (shedding) {
          // Keep only the latest pending depth snapshot per pair.
          const latestByPair = new Map<string, string>()
          for (const stream of streams) {
            const pair =
              depthPairByStreamRef.current.get(stream) ??
              symbolForStream(stream)
            const prev = latestByPair.get(pair)
            if (!prev) {
              latestByPair.set(pair, stream)
              continue
            }
            const prevAt = lastDepthSeenAtByStreamRef.current.get(prev) ?? 0
            const curAt = lastDepthSeenAtByStreamRef.current.get(stream) ?? 0
            if (curAt >= prevAt) latestByPair.set(pair, stream)
          }
          const keep = new Set(latestByPair.values())
          for (const stream of streams) {
            if (!keep.has(stream)) dirtyDepthStreams.delete(stream)
          }
          streams = [...keep]
        }
        const { selectedStreams, pairsServed, nextRoundRobin } =
          selectDepthStreamsForFlush(streams, {
            getPairForStream: (stream) =>
              depthPairByStreamRef.current.get(stream) ?? symbolForStream(stream),
            isPairInitialized: (pair) =>
              initializedDepthPairsRef.current.has(pair),
            getFirstDepthHint: (stream) =>
              pendingFirstDepthHintByStreamRef.current.get(stream),
            depthPairRoundRobin: depthPairRoundRobinRef.current,
          })
        if (nextRoundRobin !== null) {
          depthPairRoundRobinRef.current = nextRoundRobin
        }
        setPartialDepthByStream((prev) =>
          applyPartialDepthFlush(
            prev,
            selectedStreams,
            pairsServed,
            {
              depthByStream: depthByStreamRef.current,
              depthPairByStream: depthPairByStreamRef.current,
              pendingDepthKeyByStream: pendingDepthKeyByStreamRef.current,
              pendingFirstDepthHintByStream:
                pendingFirstDepthHintByStreamRef.current,
              dirtyDepthStreams,
              lastPublishedDepthKeyByStream:
                lastPublishedDepthKeyByStreamRef.current,
              initializedDepthPairs: initializedDepthPairsRef.current,
              lastDepthPublishedAtByStream:
                lastDepthPublishedAtByStreamRef.current,
              lastFirstDepthPending: lastFirstDepthPendingRef,
              lastPairsServed: lastPairsServedRef,
              lastDepthBacklog: lastDepthBacklogRef,
            },
            symbolForStream,
          ),
        )
      }

      if (klinesFlush.length > 0) {
        setCandlesBySymbol((prev) => {
          let next: Record<string, CandlestickData[]> | null = null
          for (const k of klinesFlush) {
            const sym = k.symbol
            const cur = prev[sym]
            const merged = mergeKlineIntoCandles(cur ?? [], k)
            if (merged === cur) continue
            if (!next) next = { ...prev }
            next[sym] = merged
          }
          return next ?? prev
        })
      }

      if (import.meta.env.DEV && now - lastIngestMetricsUiAtRef.current >= 1000) {
        lastIngestMetricsUiAtRef.current = now
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

      const allowed = computeStreamAllowlists(streamsSnapshot)
      const { allowedDepthIds, allowedSyms, allowedKlineSyms } = allowed

      pruneIngestRefMaps(allowed, {
        bookBySymbol: bookBySymbolRef.current,
        lastPublishedBookIdBySymbol: lastPublishedBookIdBySymbolRef.current,
        dirtyBookSymbols: dirtyBookSymbolsRef.current,
        depthByStream: depthByStreamRef.current,
        depthPairByStream: depthPairByStreamRef.current,
        pendingDepthKeyByStream: pendingDepthKeyByStreamRef.current,
        pendingFirstDepthHintByStream: pendingFirstDepthHintByStreamRef.current,
        dirtyDepthStreams: dirtyDepthStreamsRef.current,
        lastPublishedDepthKeyByStream: lastPublishedDepthKeyByStreamRef.current,
        lastDepthSeenAtByStream: lastDepthSeenAtByStreamRef.current,
        lastDepthPublishedAtByStream: lastDepthPublishedAtByStreamRef.current,
        initializedDepthPairs: initializedDepthPairsRef.current,
      })

      setBookTopBySymbol((prev) =>
        filterRecordKeepingKeys(prev, (key) => allowedSyms.has(key)),
      )
      setPartialDepthByStream((prev) =>
        filterRecordKeepingKeys(prev, (key) =>
          allowedDepthIds.has(key.toLowerCase()),
        ),
      )
      setCandlesBySymbol((prev) =>
        filterRecordKeepingKeys(prev, (key) => allowedKlineSyms.has(key)),
      )
    }

    const scheduleFlush = () => {
      if (scheduledRef.current) return
      scheduledRef.current = true
      rafRef.current = requestAnimationFrame(flush)
    }

    /** Cancel scheduled RAF and run flush now (bounded backlog — see PENDING_* constants). */
    const runFlushNow = () => {
      const now = performance.now()
      if (now - lastCatchupFlushAtRef.current < CATCHUP_FLUSH_MIN_MS) {
        scheduleFlush()
        return
      }
      lastCatchupFlushAtRef.current = now
      if (scheduledRef.current && rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
      }
      rafRef.current = null
      scheduledRef.current = false
      flush()
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
      const batch = tryEnvelopeToWorkerBatch(envelope)
      if (batch) ingestBatch(batch, source)
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
      if (batch.klines.length > 0 && !omitKlineState) {
        pendingKlinesRef.current.push(...batch.klines)
      }
      scheduleFlush()
      if (
        pendingTradesRef.current.length >= PENDING_TRADES_FLUSH_NOW ||
        pendingKlinesRef.current.length >= PENDING_KLINES_FLUSH_NOW ||
        wsMsgsSinceFlushRef.current >= WS_MSGS_FLUSH_NOW
      ) {
        runFlushNow()
      }
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
        parserWorker = createMarketParseWorker(
          (data) => ingestBatch(data, 'worker'),
          () => {
            parserWorker = null
            workerModeRef.current = false
          },
        )
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
              streamRates: msg.streamRates,
            })
            return
          }
          if (msg.type === 'error' || msg.type === 'pong') return
          recordRawWsMessageAndCoalesceFlush({
            wsMsgsSinceFlushRef,
            totalMessagesRef,
            msgsInSecondRef,
            bumpSecondWindow,
            scheduleFlush,
            runFlushNow,
            wsMsgsFlushNow: WS_MSGS_FLUSH_NOW,
          })
          const envelope = { stream: msg.stream, data: msg.payload }
          const combinedFrame = JSON.stringify(envelope)
          if (parserWorker) {
            parserWorker.postMessage(combinedFrame)
          } else if (workerModeRef.current) {
            parserWorker = createMarketParseWorker(
              (data) => ingestBatch(data, 'worker'),
              () => {
                parserWorker = null
                workerModeRef.current = false
              },
            )
            parserWorker.postMessage(combinedFrame)
          } else {
            ingestEnvelopeFallback(envelope, 'fallback')
          }
          return
        }
        recordRawWsMessageAndCoalesceFlush({
          wsMsgsSinceFlushRef,
          totalMessagesRef,
          msgsInSecondRef,
          bumpSecondWindow,
          scheduleFlush,
          runFlushNow,
          wsMsgsFlushNow: WS_MSGS_FLUSH_NOW,
        })

        if (parserWorker && typeof ev.data === 'string') {
          parserWorker.postMessage(ev.data)
          return
        }
        if (!parserWorker && workerModeRef.current) {
          parserWorker = createMarketParseWorker(
            (data) => ingestBatch(data, 'worker'),
            () => {
              parserWorker = null
              workerModeRef.current = false
            },
          )
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
  }, [fanoutWsUrl, host, omitKlineState, streamsKey, useFanout])

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
