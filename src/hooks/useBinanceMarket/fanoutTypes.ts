export type FanoutServerMessage =
  | {
      type: 'snapshot' | 'update'
      stream: string
      payload: unknown
      ts: number
    }
  | {
      type: 'health'
      upstreamConnected: boolean
      streamCount: number
      clientCount: number
      upstreamMsgsPerSec?: number
      upstreamMsgTotal?: number
      staleStreams?: Array<{ stream: string; staleForMs: number }>
      streamRates?: Array<{ stream: string; msgsPerSec: number }>
      ts: number
    }
  | { type: 'pong'; ts: number }
  | { type: 'error'; reason: string; ts: number }
