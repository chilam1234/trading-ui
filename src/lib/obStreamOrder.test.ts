import { describe, expect, it } from 'vitest'
import { mergeStreamOrder } from './obStreamOrder'

describe('mergeStreamOrder', () => {
  it('keeps preferred order for streams that still exist', () => {
    expect(
      mergeStreamOrder(
        ['ethusdt@depth10@100ms', 'btcusdt@depth10@100ms'],
        ['btcusdt@depth10@100ms', 'ethusdt@depth10@100ms'],
      ),
    ).toEqual(['ethusdt@depth10@100ms', 'btcusdt@depth10@100ms'])
  })

  it('appends new streams at end in current order', () => {
    expect(
      mergeStreamOrder(['btcusdt@depth10@100ms'], [
        'btcusdt@depth10@100ms',
        'ethusdt@depth10@100ms',
      ]),
    ).toEqual(['btcusdt@depth10@100ms', 'ethusdt@depth10@100ms'])
  })

  it('matches streams case-insensitively', () => {
    expect(
      mergeStreamOrder(['BTCUSDT@depth10@100ms'], ['btcusdt@depth10@100ms']),
    ).toEqual(['btcusdt@depth10@100ms'])
  })

  it('drops preferred entries that are no longer current', () => {
    expect(mergeStreamOrder(['gone@depth10@100ms'], ['btcusdt@depth10@100ms'])).toEqual([
      'btcusdt@depth10@100ms',
    ])
  })
})
