import { describe, expect, it, vi } from 'vitest'
import { recordRawWsMessageAndCoalesceFlush } from './recordRawWsMessageCoalescing'

describe('recordRawWsMessageAndCoalesceFlush', () => {
  it('increments counters and schedules flush; runs immediate flush at threshold', () => {
    const wsMsgsSinceFlushRef = { current: 0 }
    const totalMessagesRef = { current: 0 }
    const msgsInSecondRef = { current: 0 }
    const bumpSecondWindow = vi.fn()
    const scheduleFlush = vi.fn()
    const runFlushNow = vi.fn()

    recordRawWsMessageAndCoalesceFlush({
      wsMsgsSinceFlushRef,
      totalMessagesRef,
      msgsInSecondRef,
      bumpSecondWindow,
      scheduleFlush,
      runFlushNow,
      wsMsgsFlushNow: 3,
    })

    expect(wsMsgsSinceFlushRef.current).toBe(1)
    expect(totalMessagesRef.current).toBe(1)
    expect(msgsInSecondRef.current).toBe(1)
    expect(bumpSecondWindow).toHaveBeenCalledOnce()
    expect(scheduleFlush).toHaveBeenCalledOnce()
    expect(runFlushNow).not.toHaveBeenCalled()

    wsMsgsSinceFlushRef.current = 2
    recordRawWsMessageAndCoalesceFlush({
      wsMsgsSinceFlushRef,
      totalMessagesRef,
      msgsInSecondRef,
      bumpSecondWindow,
      scheduleFlush,
      runFlushNow,
      wsMsgsFlushNow: 3,
    })
    expect(runFlushNow).toHaveBeenCalledOnce()
  })
})
