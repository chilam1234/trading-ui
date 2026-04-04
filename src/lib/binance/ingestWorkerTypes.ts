import type {
  AggTradeFields,
  BookTop,
  KlineTick,
  PartialDepthBook,
} from './types'

export type WorkerDepthPatch = {
  pairKey: string
  stream: string
  book: PartialDepthBook
  key: string
  firstDepthHint: boolean
}

export type WorkerBookPatch = {
  pairKey: string
  book: BookTop
}

export type WorkerBatchMessage = {
  kind: 'batch'
  trades: AggTradeFields[]
  books: WorkerBookPatch[]
  depths: WorkerDepthPatch[]
  klines: KlineTick[]
}
