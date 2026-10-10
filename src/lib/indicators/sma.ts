import type { CandlestickData } from 'lightweight-charts'

/** Simple moving average of `close` (closed bars only). */
export function smaClose(
  candles: readonly CandlestickData[],
  period: number,
): { time: CandlestickData['time']; value: number }[] {
  if (period < 1 || candles.length < period) return []
  const out: { time: CandlestickData['time']; value: number }[] = []
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += candles[i - j]!.close
    }
    out.push({ time: candles[i]!.time, value: sum / period })
  }
  return out
}
