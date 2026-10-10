import { useEffect, useRef, useState } from 'react'
import {
  fetchTicker24hrBatch,
  type Ticker24hRow,
} from '../lib/binance/ticker24h'

const REFRESH_MS = 45_000

/**
 * Cached 24h ticker rows for subscribed symbols; refreshes on interval and when `symbolsKey` changes.
 */
export function useTicker24h(symbolsUpper: readonly string[], symbolsKey: string) {
  const symRef = useRef(symbolsUpper)

  const [bySymbol, setBySymbol] = useState<Record<string, Ticker24hRow>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    symRef.current = symbolsUpper
  }, [symbolsUpper])

  useEffect(() => {
    let cancelled = false
    const syms = symRef.current
    if (syms.length === 0) {
      queueMicrotask(() => {
        if (!cancelled) {
          setBySymbol({})
          setError(null)
        }
      })
      return () => {
        cancelled = true
      }
    }
    const load = () => {
      fetchTicker24hrBatch(syms)
        .then((rows) => {
          if (!cancelled) {
            setBySymbol(rows)
            setError(null)
          }
        })
        .catch((e: unknown) => {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : '24h ticker failed')
          }
        })
    }
    load()
    const id = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [symbolsKey])

  return { ticker24hBySymbol: bySymbol, ticker24hError: error }
}
