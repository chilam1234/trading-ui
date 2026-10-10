import {
  DEPTH_INIT_PRIORITY_PAIRS_PER_FLUSH,
  DEPTH_MAX_STREAMS_PER_FLUSH,
  DEPTH_PER_PAIR_QUOTA,
} from './marketIngestConstants'

export type DepthFlushSelectionOpts = {
  getPairForStream: (stream: string) => string
  isPairInitialized: (pair: string) => boolean
  getFirstDepthHint: (stream: string) => boolean | undefined
  depthPairRoundRobin: number
}

/**
 * Picks which dirty depth streams to publish this frame (priority for uninitialized pairs,
 * then round-robin among initialized). Mutates internal queues copied from `dirtyStreamList`.
 */
export function selectDepthStreamsForFlush(
  dirtyStreamList: readonly string[],
  opts: DepthFlushSelectionOpts,
): {
  selectedStreams: string[]
  pairsServed: Set<string>
  /** When non-null, assign to `depthPairRoundRobinRef` (RR advance only in the RR branch). */
  nextRoundRobin: number | null
} {
  const {
    getPairForStream,
    isPairInitialized,
    getFirstDepthHint,
    depthPairRoundRobin,
  } = opts

  const streamsByPair = new Map<string, string[]>()
  const uninitializedPairs = new Set<string>()
  const initializedPairs = new Set<string>()

  for (const stream of dirtyStreamList) {
    const pair = getPairForStream(stream)
    const arr = streamsByPair.get(pair)
    if (arr) arr.push(stream)
    else streamsByPair.set(pair, [stream])
    const hinted = getFirstDepthHint(stream)
    if (hinted || !isPairInitialized(pair)) {
      uninitializedPairs.add(pair)
    } else {
      initializedPairs.add(pair)
    }
  }

  const selectedStreams: string[] = []
  const pairsServed = new Set<string>()
  let selectedCount = 0

  for (const pair of uninitializedPairs) {
    if (pairsServed.size >= DEPTH_INIT_PRIORITY_PAIRS_PER_FLUSH) break
    const q = streamsByPair.get(pair)
    if (!q || q.length === 0) continue
    const take = q.splice(0, DEPTH_PER_PAIR_QUOTA)
    selectedStreams.push(...take)
    selectedCount += take.length
    pairsServed.add(pair)
    if (q.length === 0) streamsByPair.delete(pair)
    if (selectedCount >= DEPTH_MAX_STREAMS_PER_FLUSH) break
  }

  const rrPairs = [...initializedPairs]
  let nextRoundRobin: number | null = null

  if (rrPairs.length > 0 && selectedCount < DEPTH_MAX_STREAMS_PER_FLUSH) {
    const start = depthPairRoundRobin % rrPairs.length
    const order = [...rrPairs.slice(start), ...rrPairs.slice(0, start)]
    let progressed = true
    while (
      progressed &&
      selectedCount < DEPTH_MAX_STREAMS_PER_FLUSH &&
      streamsByPair.size > 0
    ) {
      progressed = false
      for (const pair of order) {
        const q = streamsByPair.get(pair)
        if (!q || q.length === 0) continue
        const take = q.splice(0, DEPTH_PER_PAIR_QUOTA)
        if (take.length === 0) continue
        selectedStreams.push(...take)
        selectedCount += take.length
        pairsServed.add(pair)
        progressed = true
        if (q.length === 0) streamsByPair.delete(pair)
        if (selectedCount >= DEPTH_MAX_STREAMS_PER_FLUSH) break
      }
    }
    nextRoundRobin = (start + 1) % rrPairs.length
  }

  return { selectedStreams, pairsServed, nextRoundRobin }
}
