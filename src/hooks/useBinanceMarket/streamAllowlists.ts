import {
  extractAllStreamSymbols,
  isDepthStreamId,
  symbolForStream,
} from '../../lib/binance/streamSymbols'

export type StreamAllowlists = {
  allowedDepthIds: Set<string>
  allowedSyms: Set<string>
  allowedKlineSyms: Set<string>
}

/**
 * Memoized per streamsSnapshot identity — flushes happen 60-100x/s while the stream list
 * changes rarely; recomputing three Sets per flush was measurable allocation churn (P3).
 */
const allowlistCache = new WeakMap<readonly string[], StreamAllowlists>()

export function computeStreamAllowlists(
  streamsSnapshot: readonly string[],
): StreamAllowlists {
  const cached = allowlistCache.get(streamsSnapshot)
  if (cached) {
    return cached
  }
  const computed: StreamAllowlists = {
    allowedDepthIds: new Set(
      streamsSnapshot.filter(isDepthStreamId).map((s) => s.toLowerCase()),
    ),
    allowedSyms: new Set(extractAllStreamSymbols(streamsSnapshot)),
    allowedKlineSyms: new Set(
      streamsSnapshot
        .filter((s) => s.includes('@kline_'))
        .map(symbolForStream),
    ),
  }
  allowlistCache.set(streamsSnapshot, computed)
  return computed
}
