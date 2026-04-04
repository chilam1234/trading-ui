import { DEV_LOAD_TEST_STREAMS, mergeBinanceStreams } from './binanceStreams'

/** Full public stream set for the primary symbol (includes kline). */
export function primarySymbolStreams(primaryLower: string): string[] {
  return [
    `${primaryLower}@aggTrade`,
    `${primaryLower}@bookTicker`,
    `${primaryLower}@depth10@100ms`,
    `${primaryLower}@kline_1m`,
  ]
}

/** Extra symbols: same public streams as primary (including 1m kline for chart tabs). */
export function extraSymbolStreams(symbolLower: string): string[] {
  return [
    `${symbolLower}@aggTrade`,
    `${symbolLower}@bookTicker`,
    `${symbolLower}@depth10@100ms`,
    `${symbolLower}@kline_1m`,
  ]
}

export function buildMarketStreams(options: {
  primaryLower: string
  /** Additional spot symbols (lowercase), excluding duplicates of primary. */
  extraSymbolsLower: readonly string[]
  /** Merge dev load-test streams when true. */
  loadTest: boolean
}): string[] {
  const { primaryLower, extraSymbolsLower, loadTest } = options
  const set = new Set<string>(primarySymbolStreams(primaryLower))
  for (const raw of extraSymbolsLower) {
    const sym = raw.toLowerCase()
    if (sym === primaryLower) continue
    for (const st of extraSymbolStreams(sym)) {
      set.add(st)
    }
  }
  let streams = [...set]
  if (loadTest) {
    streams = mergeBinanceStreams(streams, DEV_LOAD_TEST_STREAMS)
  }
  return streams
}
