import { describe, expect, it } from 'vitest'
import {
  extractAllStreamSymbols,
  firstDepthStreamForSymbol,
  formatPairDisplay,
  isDepthStreamId,
  streamKindSuffix,
  symbolForStream,
} from './streamSymbols'

describe('symbolForStream', () => {
  it('returns uppercase symbol before @', () => {
    expect(symbolForStream('btcusdt@depth10@100ms')).toBe('BTCUSDT')
  })

  it('uppercases bare stream id', () => {
    expect(symbolForStream('foo')).toBe('FOO')
  })
})

describe('isDepthStreamId', () => {
  it('returns true for depth multiplex ids', () => {
    expect(isDepthStreamId('btcusdt@depth10@100ms')).toBe(true)
    expect(isDepthStreamId('ethusdt@depth')).toBe(true)
  })

  it('returns false for non-depth streams', () => {
    expect(isDepthStreamId('btcusdt@aggTrade')).toBe(false)
    expect(isDepthStreamId('btcusdt@kline_1m')).toBe(false)
  })
})

describe('streamKindSuffix', () => {
  it('returns substring after first @', () => {
    expect(streamKindSuffix('btcusdt@depth10@100ms')).toBe('@depth10@100ms')
  })

  it('returns null when no @', () => {
    expect(streamKindSuffix('btcusdt')).toBeNull()
  })
})

describe('formatPairDisplay', () => {
  it('formats USDT spot as BASE/USDT', () => {
    expect(formatPairDisplay('BTCUSDT')).toBe('BTC/USDT')
  })

  it('leaves short or non-USDT symbols as-is', () => {
    expect(formatPairDisplay('ETHBTC')).toBe('ETHBTC')
  })
})

describe('extractAllStreamSymbols', () => {
  it('dedupes and preserves first-seen order', () => {
    const streams = [
      'btcusdt@aggTrade',
      'btcusdt@depth10@100ms',
      'ethusdt@aggTrade',
    ]
    expect(extractAllStreamSymbols(streams)).toEqual(['BTCUSDT', 'ETHUSDT'])
  })
})

describe('firstDepthStreamForSymbol', () => {
  it('returns first matching depth stream id', () => {
    const streams = ['ethusdt@aggTrade', 'btcusdt@depth10@100ms', 'btcusdt@bookTicker']
    expect(firstDepthStreamForSymbol(streams, 'BTCUSDT')).toBe('btcusdt@depth10@100ms')
  })

  it('returns null when no depth stream for symbol', () => {
    expect(firstDepthStreamForSymbol(['btcusdt@aggTrade'], 'ETHUSDT')).toBeNull()
  })
})
