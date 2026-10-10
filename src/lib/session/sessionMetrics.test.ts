import { describe, expect, it } from 'vitest'
import type { NormalizedTrade } from '../binance/types'
import { computeSessionDeskMetrics } from './sessionMetrics'

function t(
  symbol: string,
  price: string,
  qty: string,
  id: string,
): NormalizedTrade {
  return {
    symbol,
    id,
    price,
    quantity: qty,
    buyerIsTaker: true,
    eventTime: 0,
    ingestSeq: 0,
  }
}

describe('computeSessionDeskMetrics', () => {
  it('computes vwap and range', () => {
    const trades: NormalizedTrade[] = [
      t('BTCUSDT', '100', '1', '1'),
      t('BTCUSDT', '110', '1', '2'),
    ]
    const m = computeSessionDeskMetrics(trades, 'BTCUSDT')
    expect(m.tradeCount).toBe(2)
    expect(m.vwap).toBe(105)
    expect(m.sessionHigh).toBe(110)
    expect(m.sessionLow).toBe(100)
    expect(m.largestPrintNotional).toBe(110)
  })

  it('ignores other symbols', () => {
    const trades = [t('ETHUSDT', '1', '1', 'a'), t('BTCUSDT', '50', '2', 'b')]
    const m = computeSessionDeskMetrics(trades, 'BTCUSDT')
    expect(m.tradeCount).toBe(1)
    expect(m.vwap).toBe(50)
  })
})
