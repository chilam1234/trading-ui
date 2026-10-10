import type { MutableRefObject } from 'react'

/**
 * Count one raw WebSocket frame toward second-window stats, schedule rAF flush,
 * and flush immediately when backlog exceeds `wsMsgsFlushNow` (same path for fanout + direct).
 */
export function recordRawWsMessageAndCoalesceFlush(args: {
  wsMsgsSinceFlushRef: MutableRefObject<number>
  totalMessagesRef: MutableRefObject<number>
  msgsInSecondRef: MutableRefObject<number>
  bumpSecondWindow: (now: number) => void
  scheduleFlush: () => void
  runFlushNow: () => void
  wsMsgsFlushNow: number
}): void {
  const {
    wsMsgsSinceFlushRef,
    totalMessagesRef,
    msgsInSecondRef,
    bumpSecondWindow,
    scheduleFlush,
    runFlushNow,
    wsMsgsFlushNow,
  } = args
  wsMsgsSinceFlushRef.current += 1
  totalMessagesRef.current += 1
  msgsInSecondRef.current += 1
  const now = performance.now()
  bumpSecondWindow(now)
  scheduleFlush()
  if (wsMsgsSinceFlushRef.current >= wsMsgsFlushNow) {
    runFlushNow()
  }
}
