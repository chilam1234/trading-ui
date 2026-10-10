import { describe, expect, it } from 'vitest'
import type { KlineTick } from '../binance/types'
import { coalesceKlines } from './coalesceKlines'

function tick(
  symbol: string,
  openTime: number,
  close: string,
): KlineTick {
  return {
    symbol,
    interval: '1m',
    openTime,
    isClosed: false,
    open: '1',
    high: '2',
    low: '0.5',
    close,
  }
}

describe('coalesceKlines', () => {
  it('returns a copy for empty / single-tick input', () => {
    expect(coalesceKlines([])).toEqual([])
    const one = [tick('BTCUSDT', 1000, '10')]
    const out = coalesceKlines(one)
    expect(out).toEqual(one)
    expect(out).not.toBe(one)
  })

  it('keeps the latest tick per symbol+openTime', () => {
    const input = [
      tick('BTCUSDT', 1000, '10'),
      tick('ETHUSDT', 1000, '20'),
      tick('BTCUSDT', 1000, '11'),
      tick('BTCUSDT', 2000, '12'),
      tick('ETHUSDT', 1000, '21'),
    ]
    const out = coalesceKlines(input)
    expect(out).toHaveLength(3)
    expect(out.find((k) => k.symbol === 'BTCUSDT' && k.openTime === 1000)?.close).toBe(
      '11',
    )
    expect(out.find((k) => k.symbol === 'BTCUSDT' && k.openTime === 2000)?.close).toBe(
      '12',
    )
    expect(out.find((k) => k.symbol === 'ETHUSDT' && k.openTime === 1000)?.close).toBe(
      '21',
    )
  })
})
