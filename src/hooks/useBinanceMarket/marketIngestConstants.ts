/** Capped list length kept in React state (memory + render cost). */
export const MAX_TRADES = 600
/**
 * If pending trades/klines exceed this before the next RAF, flush immediately.
 * Prevents 500–800+ trades piling between frames (worker floods main thread).
 */
export const PENDING_TRADES_FLUSH_NOW = 320
export const PENDING_KLINES_FLUSH_NOW = 64
/** When rAF gap > RAF_GAP_SHED_MS, hard-cap pending trades merged this flush. */
export const PENDING_TRADES_SHED_HARD_CAP = 800
/** Tab busy / background: shed intermediate depth + coalesce klines. */
export const RAF_GAP_SHED_MS = 500
/** Catch-up flush (runFlushNow) at most once per this interval. */
export const CATCHUP_FLUSH_MIN_MS = 250
/**
 * Raw WebSocket messages since last flush (includes book/depth/kline, not only trades).
 * Post-fix logs still showed wsIn 200–600+ when tradeBufferLen stayed small — flush on this too.
 */
export const WS_MSGS_FLUSH_NOW = 160
/**
 * When merging a batch, only check duplicates against this many newest rows in
 * `prev` (same order as merged array: newest first). Avoids O(prev.length) work
 * every animation frame, which was blowing heap/CPU under dev React profiling.
 */
export const PREV_DEDUP_HEAD = MAX_TRADES
export const DEPTH_INIT_PRIORITY_PAIRS_PER_FLUSH = 6
export const DEPTH_PER_PAIR_QUOTA = 1
export const DEPTH_MAX_STREAMS_PER_FLUSH = 48
export const INITIAL_BACKOFF_MS = 1_000
export const MAX_BACKOFF_MS = 30_000
export const DEPTH_STALE_RECONNECT_MS = 6_000
export const DEPTH_STALE_RECONNECT_COOLDOWN_MS = 15_000
/** Max depth streams to scan per 1s window for stale reconnect (direct Binance only). */
export const STALE_DEPTH_SCAN_CAP = 64
/** Binance combined-stream practical limits (direct URL + stream count). */
export const MAX_DIRECT_COMBINED_STREAMS = 200
export const MAX_DIRECT_COMBINED_URL_LENGTH = 8000
export const FANOUT_WS_DEFAULT = 'ws://127.0.0.1:8787/ws'

export const DEFAULT_HOST = 'wss://stream.binance.com:9443'
export const MARKET_SOURCE = import.meta.env.VITE_MARKET_SOURCE ?? 'direct-binance'
