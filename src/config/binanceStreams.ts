/**
 * Extra public streams for dev load testing (adds pairs without `@kline_*` to
 * keep load-test WS smaller; app `extraSymbolStreams` includes kline per pair).
 */
export const DEV_LOAD_TEST_STREAMS: readonly string[] = [
  'ethusdt@aggTrade',
  'ethusdt@bookTicker',
  'ethusdt@depth10@100ms',
  'solusdt@aggTrade',
  'solusdt@bookTicker',
  'solusdt@depth10@100ms',
  'bnbusdt@aggTrade',
  'bnbusdt@bookTicker',
  'bnbusdt@depth10@100ms',
]

export function mergeBinanceStreams(
  base: readonly string[],
  extras: readonly string[],
): string[] {
  return [...new Set([...base, ...extras])]
}
