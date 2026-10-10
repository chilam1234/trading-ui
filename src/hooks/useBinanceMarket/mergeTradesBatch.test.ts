import { describe, expect, it } from 'vitest'
import { mergeTradeBatchIntoPrev } from './mergeTradesBatch'
import type { NormalizedTrade } from '../../lib/binance/types'

function t(symbol: string, id: number): NormalizedTrade {
  return {
    symbol,
    id: String(id),
    price: '1',
    quantity: '1',
    buyerIsTaker: false,
    eventTime: 0,
    ingestSeq: 0,
  }
}

describe('mergeTradeBatchIntoPrev', () => {
  it('worker mode prepends and caps', () => {
    const prev = [t('BTCUSDT', 1), t('BTCUSDT', 2)]
    const batch = [t('BTCUSDT', 3)]
    const out = mergeTradeBatchIntoPrev(prev, batch, {
      workerMode: true,
      maxTrades: 2,
      prevDedupHead: 512,
    })
    expect(out).toHaveLength(2)
    expect(out[0]!.id).toBe('3')
    expect(out[1]!.id).toBe('1')
  })

  it('dedup path skips ids already in prev head', () => {
    const prev = [t('BTCUSDT', 10), t('BTCUSDT', 9)]
    const batch = [t('BTCUSDT', 11), t('BTCUSDT', 10)]
    const out = mergeTradeBatchIntoPrev(prev, batch, {
      workerMode: false,
      maxTrades: 600,
      prevDedupHead: 512,
    })
    const ids = out.map((x) => x.id)
    expect(ids.filter((i) => i === '10')).toHaveLength(1)
    expect(ids).toContain('11')
  })
})
