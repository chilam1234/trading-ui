import { useMemo } from 'react'
import { DevPerfHud } from './components/DevPerfHud'
import { MarketSessionHelp } from './components/MarketSessionHelp'
import { MarketHeader } from './components/MarketHeader'
import { PairStreamMenu } from './components/PairStreamMenu'
import { SortableMarketPanels } from './components/SortableMarketPanels'
import { useSelectedStreamPairs } from './hooks/useSelectedStreamPairs'
import { useUsdtSymbolCatalog } from './hooks/useUsdtSymbolCatalog'
import { useBinanceMarket } from './hooks/useBinanceMarket'
import {
  extractAllStreamSymbols,
  firstDepthStreamForSymbol,
  symbolForStream,
} from './lib/binance/streamSymbols'

export function MarketSession(props: {
  streams: string[]
  /** Binance symbol for chart / panels (e.g. BTCUSDT). */
  primarySymbol: string
  /** Add a pair to extra markets (same as Markets picker). */
  onAddMarketPair?: (symbolLower: string) => void
  /** Remaining extra slots; when 0, Stream menu cannot add more. */
  marketSlotsRemaining?: number
}) {
  const {
    streams,
    primarySymbol,
    onAddMarketPair,
    marketSlotsRemaining = Number.POSITIVE_INFINITY,
  } = props

  const subscribedSymbols = useMemo(
    () => extractAllStreamSymbols(streams),
    [streams],
  )

  const { catalogSymbols, catalogError } = useUsdtSymbolCatalog()
  const catalogList =
    catalogSymbols !== null && catalogSymbols.length > 0
      ? catalogSymbols
      : subscribedSymbols

  const {
    selectedPairs,
    togglePair,
    selectAllPairs,
    clearAllPairs,
  } = useSelectedStreamPairs(subscribedSymbols)

  const depthStreams = useMemo(
    () => streams.filter((s) => s.includes('@depth')),
    [streams],
  )

  const visibleDepthStreams = useMemo(
    () =>
      depthStreams.filter((s) => selectedPairs.has(symbolForStream(s))),
    [depthStreams, selectedPairs],
  )

  const tapeSymbols = useMemo(() => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const stream of streams) {
      if (!stream.includes('@aggTrade')) continue
      const at = stream.indexOf('@')
      if (at <= 0) continue
      const sym = stream.slice(0, at).toUpperCase()
      if (seen.has(sym)) continue
      seen.add(sym)
      out.push(sym)
    }
    return out
  }, [streams])

  /** Symbols with `@kline_*` subscribed (chart pair tabs). */
  const klineSymbols = useMemo(() => {
    const out: string[] = []
    const seen = new Set<string>()
    for (const stream of streams) {
      if (!stream.includes('@kline_')) continue
      const sym = symbolForStream(stream)
      if (seen.has(sym)) continue
      seen.add(sym)
      out.push(sym)
    }
    out.sort()
    return out
  }, [streams])

  const {
    connection,
    trades,
    bookTopBySymbol,
    partialDepthByStream,
    candlesBySymbol,
    stats,
    ingestMetrics,
    backendHealth,
  } = useBinanceMarket(streams)

  const pulseRows = useMemo(() => {
    return subscribedSymbols.map((sym) => {
      const u = sym.toUpperCase()
      const dStream = firstDepthStreamForSymbol(streams, u)
      const depth =
        dStream != null ? (partialDepthByStream[dStream] ?? null) : null
      return {
        symbolUpper: u,
        book: bookTopBySymbol[u] ?? null,
        depth,
      }
    })
  }, [subscribedSymbols, streams, bookTopBySymbol, partialDepthByStream])

  return (
    <>
      <MarketHeader
        connection={connection}
        stats={stats}
        pulse={pulseRows.map((row) => ({
          ...row,
          trades,
        }))}
      />
      <MarketSessionHelp />
      {subscribedSymbols.length > 0 || (catalogSymbols?.length ?? 0) > 0 ? (
        <div className="pair-stream-menu-bar">
          <PairStreamMenu
            catalogSymbols={catalogList}
            subscribedSymbols={subscribedSymbols}
            selectedPairs={selectedPairs}
            onToggle={togglePair}
            onSelectAll={selectAllPairs}
            onClearAll={clearAllPairs}
            catalogError={catalogError}
            catalogLoading={catalogSymbols === null && !catalogError}
            onAddMarketPair={onAddMarketPair}
            marketSlotsRemaining={marketSlotsRemaining}
          />
        </div>
      ) : null}
      <SortableMarketPanels
        visibleDepthStreams={visibleDepthStreams}
        partialDepthByStream={partialDepthByStream}
        trades={trades}
        tapeSymbols={tapeSymbols}
        selectedPairs={selectedPairs}
        primarySymbol={primarySymbol}
        klineSymbols={klineSymbols}
        candlesBySymbol={candlesBySymbol}
      />
      {import.meta.env.DEV ? (
        <DevPerfHud
          stats={stats}
          ingest={ingestMetrics}
          backendHealth={backendHealth}
        />
      ) : null}
    </>
  )
}
