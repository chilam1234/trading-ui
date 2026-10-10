/** Symbol prefix from a multiplex stream id (e.g. `btcusdt@depth10@100ms` → `BTCUSDT`). */
export function symbolForStream(stream: string): string {
  const at = stream.indexOf('@')
  return at > 0 ? stream.slice(0, at).toUpperCase() : stream.toUpperCase()
}

/** True if multiplex id is a depth book stream (e.g. `btcusdt@depth10@100ms`). */
export function isDepthStreamId(streamId: string): boolean {
  return streamId.includes('@depth')
}

/** Part after first `@` (e.g. `depth10@100ms`), or null if missing. */
export function streamKindSuffix(streamId: string): string | null {
  const at = streamId.indexOf('@')
  if (at <= 0) return null
  return streamId.slice(at)
}

/** Display label for a spot symbol (e.g. `BTCUSDT` → `BTC/USDT`). */
export function formatPairDisplay(symbolUpper: string): string {
  const s = symbolUpper.toUpperCase()
  if (s.length > 4 && s.endsWith('USDT')) {
    return `${s.slice(0, -4)}/USDT`
  }
  return s
}

/** Unique symbols across all subscribed streams, first-seen order. */
export function extractAllStreamSymbols(streams: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const stream of streams) {
    const at = stream.indexOf('@')
    if (at <= 0) continue
    const sym = stream.slice(0, at).toUpperCase()
    if (seen.has(sym)) continue
    seen.add(sym)
    out.push(sym)
  }
  return out
}

/** Symbols with an `@aggTrade` multiplex stream (tape), first-seen order. */
export function extractAggTradeSymbols(streams: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const stream of streams) {
    if (!stream.includes('@aggTrade')) continue
    const at = stream.indexOf('@')
    if (at <= 0) continue
    const sym = stream.slice(0, at).toUpperCase()
    if (seen.has(sym)) continue
    seen.add(sym)
    out.push(sym)
  }
  return out
}

/** Symbols with `@kline_*` multiplex streams (chart tabs), unique and sorted. */
export function extractKlineChartSymbols(streams: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const stream of streams) {
    if (!stream.includes('@kline_')) continue
    const sym = symbolForStream(stream)
    if (seen.has(sym)) continue
    seen.add(sym)
    out.push(sym)
  }
  out.sort()
  return out
}

/** First `@depth*` multiplex id in `streams` for this symbol (subscription order). */
export function firstDepthStreamForSymbol(
  streams: readonly string[],
  symbolUpper: string,
): string | null {
  const u = symbolUpper.toUpperCase()
  for (const s of streams) {
    if (!s.includes('@depth')) continue
    if (symbolForStream(s) === u) return s
  }
  return null
}
