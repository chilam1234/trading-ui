import { describe, expect, it } from 'vitest'
import { mergeKlineIntoCandles } from './klineMerge'
import type { KlineTick } from './types'

const baseK: KlineTick = {
  symbol: 'BTCUSDT',
  interval: '1m',
  openTime: 1_700_000_000_000,
  isClosed: false,
  open: '1',
  high: '2',
  low: '0.5',
  close: '1.5',
}

describe('mergeKlineIntoCandles', () => {
  it('returns same reference when updating in-place bar with identical OHLC', () => {
    const prev = mergeKlineIntoCandles([], baseK)
    const again = mergeKlineIntoCandles(prev, baseK)
    expect(again).toBe(prev)
  })
})
