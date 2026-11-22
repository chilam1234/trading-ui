import { describe, expect, it } from 'vitest'
import type { CandlestickData } from 'lightweight-charts'
import {
  candlePrefixHash,
  planCandleUpdate,
  type CandleUpdateState,
} from './candleUpdate'

function candle(
  t: number,
  o: number,
  h: number,
  l: number,
  c: number,
): CandlestickData {
  return {
    time: t as unknown as CandlestickData['time'],
    open: o,
    high: h,
    low: l,
    close: c,
  }
}

const base = [
  candle(1, 10, 12, 9, 11),
  candle(2, 11, 13, 10, 12),
  candle(3, 12, 14, 11, 13),
]

/** State as the component holds it after painting `prev`. */
function stateAfter(prev: CandlestickData[]): CandleUpdateState {
  return {
    prevLen: prev.length,
    prevHeadHash: candlePrefixHash(prev, prev.length - 1),
    prevFullHash: candlePrefixHash(prev, prev.length),
    prevLastTime: prev.length > 0 ? Number(prev[prev.length - 1]!.time) : Number.NaN,
  }
}

describe('candlePrefixHash', () => {
  it('is stable for identical data', () => {
    expect(candlePrefixHash(base, 3)).toBe(candlePrefixHash([...base], 3))
  })

  it('changes when any field of any row changes', () => {
    const variants = [
      [candle(1, 99, 12, 9, 11), ...base.slice(1)],
      [base[0]!, candle(2, 11, 99, 10, 12), base[2]!],
      [...base.slice(0, -1), candle(3, 12, 14, 11, 99)],
    ]
    for (const v of variants) {
      expect(candlePrefixHash(v, 3)).not.toBe(candlePrefixHash(base, 3))
    }
  })

  it('does not hash rows past the requested prefix', () => {
    const longer = [...base, candle(4, 13, 16, 12, 15)]
    expect(candlePrefixHash(longer, 3)).toBe(candlePrefixHash(base, 3))
  })
})

describe('planCandleUpdate', () => {
  it('takes the fast path when only the forming candle changes', () => {
    const next = [...base.slice(0, -1), candle(3, 12, 15, 11, 14)]
    expect(planCandleUpdate(stateAfter(base), next)).toBe('update-last')
  })

  it('takes the fast path when a new candle opens (append)', () => {
    const next = [...base, candle(4, 13, 16, 12, 15)]
    expect(planCandleUpdate(stateAfter(base), next)).toBe('update-last')
  })

  it('falls back to set-data when two candles arrive at once', () => {
    const next = [...base, candle(4, 13, 16, 12, 15), candle(5, 15, 17, 14, 16)]
    expect(planCandleUpdate(stateAfter(base), next)).toBe('set-data')
  })

  it('falls back to set-data when a historical candle is revised', () => {
    // Same length, same final row, but an earlier close changed. The old
    // single-row signature missed this entirely and left the chart stale.
    const next = [candle(1, 10, 12, 9, 99), base[1]!, base[2]!]
    expect(planCandleUpdate(stateAfter(base), next)).toBe('set-data')
  })

  it('falls back to set-data when the tail is rewritten by a different series', () => {
    const next = [candle(7, 20, 22, 19, 21), candle(8, 21, 23, 20, 22)]
    expect(planCandleUpdate(stateAfter(base), next)).toBe('set-data')
  })

  it('falls back to set-data when the append does not continue the series', () => {
    // Length grew by one, but the row that used to be last was replaced, so the
    // prefix hash no longer matches: this is a rebuild, not an append.
    const next = [base[0]!, base[1]!, candle(4, 12, 14, 11, 13), candle(5, 13, 15, 12, 14)]
    expect(planCandleUpdate(stateAfter(base), next)).toBe('set-data')
  })

  it('falls back to set-data when the final bar time moves without a length change', () => {
    // Same length, head identical, but the last bar jumped to a new time. Calling
    // update() here would append a bar instead of replacing the stale one.
    const next = [base[0]!, base[1]!, candle(9, 12, 14, 11, 13)]
    expect(planCandleUpdate(stateAfter(base), next)).toBe('set-data')
  })

  it('falls back to set-data when a "new" bar is not newer', () => {
    const next = [...base, candle(2, 99, 99, 99, 99)]
    expect(planCandleUpdate(stateAfter(base), next)).toBe('set-data')
  })

  it('falls back to set-data when the series shrinks', () => {
    expect(planCandleUpdate(stateAfter(base), base.slice(0, 2))).toBe('set-data')
  })

  it('falls back to set-data below two rows so fitContent still runs', () => {
    expect(planCandleUpdate(stateAfter([]), [candle(1, 1, 2, 0.5, 1.5)])).toBe(
      'set-data',
    )
    expect(planCandleUpdate(stateAfter(base), [])).toBe('set-data')
  })

  it('regression: append compares like-for-like prefixes', () => {
    // The old code compared a prevLen-row head signature against a prevLen-1-row
    // one, which can never be equal, so every new candle did a full setData of
    // up to 400 rows instead of appending one.
    const state = stateAfter(base)
    const next = [...base, candle(4, 13, 16, 12, 15)]
    expect(candlePrefixHash(next, state.prevLen)).toBe(state.prevFullHash)
    expect(planCandleUpdate(state, next)).toBe('update-last')
  })
})
