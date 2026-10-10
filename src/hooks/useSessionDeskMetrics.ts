import { useEffect, useRef, useState } from 'react'
import type { NormalizedTrade } from '../lib/binance/types'
import {
  computeSessionDeskMetrics,
  type SessionDeskMetrics,
} from '../lib/session/sessionMetrics'

const THROTTLE_MS = 250

/**
 * Session desk metrics from the tape buffer, recomputed at most every `THROTTLE_MS`.
 */
export function useSessionDeskMetrics(
  symbolUpper: string,
  trades: readonly NormalizedTrade[],
) {
  const tradesRef = useRef(trades)

  const [m, setM] = useState<SessionDeskMetrics>(() =>
    computeSessionDeskMetrics(trades, symbolUpper),
  )

  useEffect(() => {
    tradesRef.current = trades
  }, [trades])

  useEffect(() => {
    setM(computeSessionDeskMetrics(tradesRef.current, symbolUpper))
  }, [symbolUpper])

  useEffect(() => {
    const id = window.setInterval(() => {
      setM(computeSessionDeskMetrics(tradesRef.current, symbolUpper))
    }, THROTTLE_MS)
    return () => window.clearInterval(id)
  }, [symbolUpper])

  return m
}
