import type { CandlestickData, UTCTimestamp } from 'lightweight-charts'
import type { KlineTick } from './types'

const MAX_CANDLES = 400

export function klineToCandle(k: KlineTick): CandlestickData {
  return {
    time: Math.floor(k.openTime / 1000) as UTCTimestamp,
    open: Number(k.open),
    high: Number(k.high),
    low: Number(k.low),
    close: Number(k.close),
  }
}

/** Merge one kline update into sorted OHLC history (replace same openTime or append). */
export function mergeKlineIntoCandles(
  prev: CandlestickData[],
  k: KlineTick,
): CandlestickData[] {
  const bar = klineToCandle(k)
  const t = bar.time as number
  const i = prev.findIndex((c) => (c.time as number) === t)
  let next: CandlestickData[]
  if (i >= 0) {
    next = [...prev]
    next[i] = bar
  } else {
    next = [...prev, bar].sort((a, b) => (a.time as number) - (b.time as number))
    if (next.length > MAX_CANDLES) {
      next = next.slice(-MAX_CANDLES)
    }
  }
  return next
}
