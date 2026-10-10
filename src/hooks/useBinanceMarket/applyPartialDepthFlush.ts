import type { PartialDepthBook } from '../../lib/binance/types'
import { partialDepthContentKey } from '../../lib/binance/partialDepthContentKey'

export type DepthFlushApplyRefs = {
  depthByStream: Map<string, PartialDepthBook>
  depthPairByStream: Map<string, string>
  pendingDepthKeyByStream: Map<string, string>
  pendingFirstDepthHintByStream: Map<string, boolean>
  dirtyDepthStreams: Set<string>
  lastPublishedDepthKeyByStream: Map<string, string>
  initializedDepthPairs: Set<string>
  lastDepthPublishedAtByStream: Map<string, number>
  lastFirstDepthPending: { current: number }
  lastPairsServed: { current: number }
  lastDepthBacklog: { current: number }
}

/**
 * Merges selected depth snapshots into React state and updates ingest metric refs.
 * Matches previous `flush` behavior: mutates ref maps and `dirtyDepthStreams` for selected ids.
 */
export function applyPartialDepthFlush(
  prev: Record<string, PartialDepthBook>,
  selectedStreams: readonly string[],
  pairsServed: Set<string>,
  refs: DepthFlushApplyRefs,
  symbolForStream: (stream: string) => string,
): Record<string, PartialDepthBook> {
  const {
    depthByStream,
    depthPairByStream,
    pendingDepthKeyByStream,
    pendingFirstDepthHintByStream,
    dirtyDepthStreams,
    lastPublishedDepthKeyByStream,
    initializedDepthPairs,
    lastDepthPublishedAtByStream,
    lastFirstDepthPending,
    lastPairsServed,
    lastDepthBacklog,
  } = refs

  let next: Record<string, PartialDepthBook> | null = null
  for (const stream of selectedStreams) {
    const book = depthByStream.get(stream)
    if (!book) {
      continue
    }
    const pair = depthPairByStream.get(stream) ?? symbolForStream(stream)
    const key =
      pendingDepthKeyByStream.get(stream) ?? partialDepthContentKey(book)
    const lastKey = lastPublishedDepthKeyByStream.get(stream)
    dirtyDepthStreams.delete(stream)
    pendingFirstDepthHintByStream.delete(stream)
    if (lastKey === key) {
      continue
    }
    lastPublishedDepthKeyByStream.set(stream, key)
    initializedDepthPairs.add(pair)
    lastDepthPublishedAtByStream.set(stream, Date.now())
    if (!next) next = { ...prev }
    next[stream] = book
  }
  for (const stream of selectedStreams) {
    pendingDepthKeyByStream.delete(stream)
  }
  const pendingPairs = new Set<string>()
  for (const stream of dirtyDepthStreams) {
    const pair = depthPairByStream.get(stream) ?? symbolForStream(stream)
    if (!initializedDepthPairs.has(pair)) pendingPairs.add(pair)
  }
  lastFirstDepthPending.current = pendingPairs.size
  lastPairsServed.current = pairsServed.size
  lastDepthBacklog.current = dirtyDepthStreams.size
  return next ?? prev
}
