import { describe, expect, it } from 'vitest'
import type { BookTop, NormalizedTrade, PartialDepthBook } from '../binance/types'
import { computePulseMetrics } from './pulseMetrics'

function trade(
  symbol: string,
  qty: string,
  buyerIsTaker: boolean,
  id = '1',
): NormalizedTrade {
  return {
    symbol,
    id,
    price: '1',
    quantity: qty,
    buyerIsTaker,
    eventTime: 0,
    ingestSeq: 0,
  }
}

describe('computePulseMetrics', () => {
  it('computes mid, spread, bps from book', () => {
    const book: BookTop = {
      symbol: 'BTCUSDT',
      bestBid: '100',
      bestBidQty: '1',
      bestAsk: '102',
      bestAskQty: '1',
      updateId: 1,
    }
    const m = computePulseMetrics(book, [], 'BTCUSDT', 120, null)
    expect(m.mid).toBe(101)
    expect(m.hasDepth).toBe(false)
    expect(m.spread).toBe(2)
    expect(m.spreadBps).toBeCloseTo((2 / 101) * 10_000, 5)
  })

  it('computes flow skew from aggressive buy/sell volume', () => {
    const book: BookTop = {
      symbol: 'BTCUSDT',
      bestBid: '100',
      bestBidQty: '1',
      bestAsk: '100',
      bestAskQty: '1',
      updateId: 1,
    }
    const trades: NormalizedTrade[] = [
      trade('BTCUSDT', '2', true, 'a'),
      trade('BTCUSDT', '1', false, 'b'),
    ]
    const m = computePulseMetrics(book, trades, 'BTCUSDT', 120, null)
    expect(m.buyVol).toBe(2)
    expect(m.sellVol).toBe(1)
    expect(m.flowSkew).toBeCloseTo(1 / 3, 6)
  })

  it('skips non-primary symbols when walking the tape', () => {
    const trades: NormalizedTrade[] = [
      trade('ETHUSDT', '99', true, 'x'),
      trade('BTCUSDT', '1', true, 'a'),
    ]
    const m = computePulseMetrics(null, trades, 'BTCUSDT', 120, null)
    expect(m.tradesInWindow).toBe(1)
    expect(m.buyVol).toBe(1)
  })

  it('computes depth skew from resting notional (top levels)', () => {
    const depth: PartialDepthBook = {
      lastUpdateId: 1,
      lastUpdateIdStr: '1',
      bids: [{ price: '100', quantity: '2' }],
      asks: [{ price: '101', quantity: '1' }],
    }
    const m = computePulseMetrics(null, [], 'BTCUSDT', 120, depth, 10)
    expect(m.hasDepth).toBe(true)
    expect(m.depthBidNotional).toBe(200)
    expect(m.depthAskNotional).toBe(101)
    expect(m.depthSkew).toBeCloseTo(99 / 301, 6)
  })
})
