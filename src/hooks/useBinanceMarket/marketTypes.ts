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
  /** Fanout: top streams by msgs in last completed second. */
  streamRates?: Array<{ stream: string; msgsPerSec: number }>
}
