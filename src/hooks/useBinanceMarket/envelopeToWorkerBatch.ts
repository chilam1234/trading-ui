import type { WorkerBatchMessage } from '../../lib/binance/ingestWorkerTypes'
import { partialDepthContentKey } from '../../lib/binance/partialDepthContentKey'
import {
  parseAggTrade,
  parseBookTicker,
  parseKline,
  parsePartialDepthWithStream,
} from '../../lib/binance/parse'
import { symbolForStream } from '../../lib/binance/streamSymbols'

/** Map a single JSON envelope (combined stream or fanout `{ stream, data }`) to a worker batch. */
export function tryEnvelopeToWorkerBatch(
  envelope: unknown,
): WorkerBatchMessage | null {
  const trade = parseAggTrade(envelope)
  if (trade) {
    return {
      kind: 'batch',
      trades: [trade],
      books: [],
      depths: [],
      klines: [],
    }
  }
  const book = parseBookTicker(envelope)
  if (book) {
    return {
      kind: 'batch',
      trades: [],
      books: [{ pairKey: book.symbol.toUpperCase(), book }],
      depths: [],
      klines: [],
    }
  }
  const depthLabeled = parsePartialDepthWithStream(envelope)
  if (depthLabeled) {
    return {
      kind: 'batch',
      trades: [],
      books: [],
      depths: [
        {
          pairKey: symbolForStream(depthLabeled.stream),
          stream: depthLabeled.stream,
          book: depthLabeled.book,
          key: partialDepthContentKey(depthLabeled.book),
          firstDepthHint: false,
        },
      ],
      klines: [],
    }
  }
  const kline = parseKline(envelope)
  if (kline) {
    return {
      kind: 'batch',
      trades: [],
      books: [],
      depths: [],
      klines: [kline],
    }
  }
  return null
}
