import type { BookTop, PartialDepthBook } from '../../lib/binance/types'
import type { StreamAllowlists } from './streamAllowlists'

export type IngestRefMaps = {
  bookBySymbol: Map<string, BookTop>
  lastPublishedBookIdBySymbol: Map<string, number>
  dirtyBookSymbols: Set<string>
  depthByStream: Map<string, PartialDepthBook>
  depthPairByStream: Map<string, string>
  pendingDepthKeyByStream: Map<string, string>
  pendingFirstDepthHintByStream: Map<string, boolean>
  dirtyDepthStreams: Set<string>
  lastPublishedDepthKeyByStream: Map<string, string>
  lastDepthSeenAtByStream: Map<string, number>
  lastDepthPublishedAtByStream: Map<string, number>
  initializedDepthPairs: Set<string>
}

/** Drop ref-map entries that no longer belong to the active stream snapshot. */
export function pruneIngestRefMaps(
  allowed: StreamAllowlists,
  m: IngestRefMaps,
): void {
  const { allowedDepthIds, allowedSyms } = allowed
  for (const k of [...m.bookBySymbol.keys()]) {
    if (!allowedSyms.has(k)) m.bookBySymbol.delete(k)
  }
  for (const k of [...m.lastPublishedBookIdBySymbol.keys()]) {
    if (!allowedSyms.has(k)) m.lastPublishedBookIdBySymbol.delete(k)
  }
  for (const k of [...m.dirtyBookSymbols]) {
    if (!allowedSyms.has(k)) m.dirtyBookSymbols.delete(k)
  }
  for (const k of [...m.depthByStream.keys()]) {
    if (!allowedDepthIds.has(k.toLowerCase())) m.depthByStream.delete(k)
  }
  for (const k of [...m.depthPairByStream.keys()]) {
    if (!allowedDepthIds.has(k.toLowerCase())) m.depthPairByStream.delete(k)
  }
  for (const k of [...m.pendingDepthKeyByStream.keys()]) {
    if (!allowedDepthIds.has(k.toLowerCase()))
      m.pendingDepthKeyByStream.delete(k)
  }
  for (const k of [...m.pendingFirstDepthHintByStream.keys()]) {
    if (!allowedDepthIds.has(k.toLowerCase()))
      m.pendingFirstDepthHintByStream.delete(k)
  }
  for (const k of [...m.dirtyDepthStreams]) {
    if (!allowedDepthIds.has(k.toLowerCase())) m.dirtyDepthStreams.delete(k)
  }
  for (const k of [...m.lastPublishedDepthKeyByStream.keys()]) {
    if (!allowedDepthIds.has(k.toLowerCase()))
      m.lastPublishedDepthKeyByStream.delete(k)
  }
  for (const k of [...m.lastDepthSeenAtByStream.keys()]) {
    if (!allowedDepthIds.has(k.toLowerCase()))
      m.lastDepthSeenAtByStream.delete(k)
  }
  for (const k of [...m.lastDepthPublishedAtByStream.keys()]) {
    if (!allowedDepthIds.has(k.toLowerCase()))
      m.lastDepthPublishedAtByStream.delete(k)
  }
  for (const k of [...m.initializedDepthPairs]) {
    if (!allowedSyms.has(k)) m.initializedDepthPairs.delete(k)
  }
}
