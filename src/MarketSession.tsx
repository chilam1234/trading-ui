import { useEffect, useMemo, useState } from 'react'
import { DevPerfHud } from './components/DevPerfHud'
import { MarketSessionHelp } from './components/MarketSessionHelp'
import { MarketHeader } from './components/MarketHeader'
import { PairStreamMenu } from './components/PairStreamMenu'
import { SortableMarketPanels } from './components/SortableMarketPanels'
import { useSelectedStreamPairs } from './hooks/useSelectedStreamPairs'
import { useUsdtSymbolCatalog } from './hooks/useUsdtSymbolCatalog'
import { useBinanceMarket } from './hooks/useBinanceMarket'
import { useTicker24h } from './hooks/useTicker24h'
import { readHideChartFlag } from './config/hideChart'
import {
  extractAggTradeSymbols,
  extractAllStreamSymbols,
  extractKlineChartSymbols,
  firstDepthStreamForSymbol,
  isDepthStreamId,
  symbolForStream,
} from './lib/binance/streamSymbols'
import { DPR_CHANGED_EVENT } from './lib/render/canvasDpr'
import { shouldShowDevPerf } from './lib/render/shouldShowDevPerf'

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

  const [chartPanelHidden] = useState(readHideChartFlag)
  const [showDevPerf, setShowDevPerf] = useState(() => shouldShowDevPerf())

  useEffect(() => {
    const reeval = () => setShowDevPerf(shouldShowDevPerf())
    window.addEventListener(DPR_CHANGED_EVENT, reeval)
    window.addEventListener('storage', reeval)
    return () => {
      window.removeEventListener(DPR_CHANGED_EVENT, reeval)
      window.removeEventListener('storage', reeval)
    }
  }, [])

  /** Omit `@kline_*` from the live socket when chart is hidden — saves parse/postMessage/flush work. */
  const streamsForSocket = useMemo(
    () =>
      chartPanelHidden
        ? streams.filter((s) => !s.includes('@kline_'))
        : streams,
    [chartPanelHidden, streams],
  )

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
    () => streams.filter(isDepthStreamId),
    [streams],
  )

  const visibleDepthStreams = useMemo(
    () =>
      depthStreams.filter((s) => selectedPairs.has(symbolForStream(s))),
    [depthStreams, selectedPairs],
  )

  const tapeSymbols = useMemo(
    () => extractAggTradeSymbols(streams),
    [streams],
  )

  /** Symbols with `@kline_*` subscribed (chart pair tabs). */
  const klineSymbols = useMemo(
    () => extractKlineChartSymbols(streams),
    [streams],
  )

  const {
    connection,
    trades,
    bookTopBySymbol,
    partialDepthByStream,
    candlesBySymbol,
    stats,
    ingestMetrics,
    backendHealth,
  } = useBinanceMarket(streamsForSocket, { omitKlineState: chartPanelHidden })

  const streamsKey = useMemo(() => streams.join(','), [streams])

  const { ticker24hBySymbol, ticker24hError } = useTicker24h(
    subscribedSymbols,
    streamsKey,
  )

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
        ticker24hBySymbol={ticker24hBySymbol}
        ticker24hError={ticker24hError}
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
      {showDevPerf ? (
        <DevPerfHud
          stats={stats}
          ingest={ingestMetrics}
          backendHealth={backendHealth}
        />
      ) : null}
    </>
  )
}
