import { describe, expect, it } from 'vitest'
import type { CandlestickData } from 'lightweight-charts'
import { smaClose } from './sma'

function bar(
  time: CandlestickData['time'],
  close: number,
): CandlestickData {
  return {
    time,
    open: close,
    high: close,
    low: close,
    close,
  }
}

describe('smaClose', () => {
  it('returns empty when period < 1 or not enough bars', () => {
    const c: CandlestickData[] = [bar(1 as CandlestickData['time'], 1)]
    expect(smaClose(c, 0)).toEqual([])
    expect(smaClose(c, 2)).toEqual([])
  })

  it('computes SMA(3) on closes', () => {
    const c: CandlestickData[] = [
      bar(1 as CandlestickData['time'], 1),
      bar(2 as CandlestickData['time'], 2),
      bar(3 as CandlestickData['time'], 3),
      bar(4 as CandlestickData['time'], 4),
    ]
    const out = smaClose(c, 3)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ time: 3 as CandlestickData['time'], value: 2 })
    expect(out[1]).toEqual({ time: 4 as CandlestickData['time'], value: 3 })
  })
})
