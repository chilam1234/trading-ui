import { describe, expect, it } from 'vitest'
import { selectDepthStreamsForFlush } from './depthFlushSelection'

describe('selectDepthStreamsForFlush', () => {
  it('prioritizes uninitialized pair before round-robin', () => {
    const { selectedStreams, nextRoundRobin } = selectDepthStreamsForFlush(
      ['btcusdt@depth5@0ms', 'ethusdt@depth5@0ms'],
      {
        getPairForStream: (s) => s.split('@')[0]!.toUpperCase(),
        isPairInitialized: (pair) => pair === 'ETHUSDT',
        getFirstDepthHint: () => undefined,
        depthPairRoundRobin: 0,
      },
    )
    expect(selectedStreams).toContain('btcusdt@depth5@0ms')
    expect(nextRoundRobin).not.toBeNull()
  })

  it('returns empty when nothing dirty maps to pairs', () => {
    const { selectedStreams } = selectDepthStreamsForFlush([], {
      getPairForStream: (s) => s,
      isPairInitialized: () => false,
      getFirstDepthHint: () => undefined,
      depthPairRoundRobin: 0,
    })
    expect(selectedStreams).toEqual([])
  })
})
