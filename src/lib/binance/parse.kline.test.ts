import { describe, expect, it } from 'vitest'
import { parseKline } from './parse'

const minimalK = {
  i: '1m',
  t: 1_704_000_000_000,
  x: false,
  o: '42000.00',
  h: '42100.00',
  l: '41900.00',
  c: '42050.00',
}

describe('parseKline', () => {
  it('uses inner symbol s when present', () => {
    const raw = {
      stream: 'btcusdt@kline_1m',
      data: {
        e: 'kline',
        E: 1,
        s: 'BTCUSDT',
        k: minimalK,
      },
    }
    const k = parseKline(raw)
    expect(k?.symbol).toBe('BTCUSDT')
    expect(k?.interval).toBe('1m')
  })

  it('falls back to multiplex stream id when s is missing (fanout-safe)', () => {
    const raw = {
      stream: 'ethusdt@kline_1m',
      data: {
        e: 'kline',
        E: 1,
        k: minimalK,
      },
    }
    const k = parseKline(raw)
    expect(k?.symbol).toBe('ETHUSDT')
  })

  it('returns null when k object is invalid', () => {
    expect(parseKline({ stream: 'x@kline_1m', data: { e: 'kline', s: 'BTCUSDT' } })).toBeNull()
  })
})
