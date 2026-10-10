import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'
import { DEFAULT_MAX_EXTRA, SymbolPicker } from './components/SymbolPicker'
import { MarketSession } from './MarketSession'
import { buildMarketStreams } from './config/buildStreams'
import {
  loadExtraSymbols,
  saveExtraSymbols,
} from './config/extraSymbolsStorage'
/** Liquid pair: primary market (public streams, no API key). */
const SYMBOL = (import.meta.env.VITE_PRIMARY_SYMBOL ?? 'btcusdt').toLowerCase()

function App() {
  const [extraSymbols, setExtraSymbols] = useState<string[]>(loadExtraSymbols)

  useEffect(() => {
    saveExtraSymbols(extraSymbols)
  }, [extraSymbols])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const onError = (e: ErrorEvent) => {
      console.error('[window error]', e.message, e.filename, e.lineno, e.error)
    }
    const onRejection = (e: PromiseRejectionEvent) => {
      console.error('[unhandledrejection]', e.reason)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  const streams = useMemo(() => {
    const loadTest =
      import.meta.env.DEV && import.meta.env.VITE_BINANCE_LOADTEST === '1'
    return buildMarketStreams({
      primaryLower: SYMBOL,
      extraSymbolsLower: extraSymbols,
      loadTest,
    })
  }, [extraSymbols])

  const streamsKey = streams.join(',')

  const addMarketPair = useCallback((symbolLower: string) => {
    const s = symbolLower.toLowerCase()
    if (s === SYMBOL) return
    setExtraSymbols((prev) => {
      const lower = prev.map((x) => x.toLowerCase())
      if (lower.includes(s)) return prev
      if (prev.length >= DEFAULT_MAX_EXTRA) return prev
      return [...prev, s].sort()
    })
  }, [])

  const marketSlotsRemaining = Math.max(0, DEFAULT_MAX_EXTRA - extraSymbols.length)

  return (
    <div className="app">
      <p className="app-toolbar-legend" id="app-toolbar-legend">
        <strong>Markets</strong> — subscribed pairs for this session.{' '}
        <strong>Stream pairs</strong> — toggle tape and order-book visibility (socket still carries all
        subscribed streams).
      </p>
      <div className="app-toolbar" aria-describedby="app-toolbar-legend">
        <SymbolPicker
          primaryLower={SYMBOL}
          extraSymbols={extraSymbols}
          onExtraSymbolsChange={setExtraSymbols}
        />
      </div>
      <MarketSession
        key={streamsKey}
        streams={streams}
        primarySymbol={SYMBOL.toUpperCase()}
        onAddMarketPair={addMarketPair}
        marketSlotsRemaining={marketSlotsRemaining}
      />
    </div>
  )
}

export default App
