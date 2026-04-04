import { useEffect, useState } from 'react'
import { fetchUsdtTradingSymbols } from '../lib/binance/exchangeInfo'

/**
 * Full USDT TRADING spot list for Stream pairs menu (same source as Markets picker).
 */
export function useUsdtSymbolCatalog() {
  const [symbols, setSymbols] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchUsdtTradingSymbols()
      .then((list) => {
        if (!cancelled) {
          setSymbols(list)
          setError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSymbols([])
          setError(e instanceof Error ? e.message : 'Failed to load catalog')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { catalogSymbols: symbols, catalogError: error }
}
