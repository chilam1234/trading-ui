import type {
  BookTop,
  ConnectionState,
  NormalizedTrade,
  PartialDepthBook,
} from '../lib/binance/types'
import type { MarketStats } from '../hooks/useBinanceMarket'
import { PairDeskCard } from './PairDeskCard'
import { PulseStrip } from './PulseStrip'
import { SessionStrip, Ticker24hStrip } from './SessionStrip'
import type { Ticker24hRow } from '../lib/binance/ticker24h'

function connLabel(s: ConnectionState): string {
  switch (s) {
    case 'idle':
      return 'Idle'
    case 'connecting':
      return 'Connecting…'
    case 'open':
      return 'Live'
    case 'closed':
      return 'Disconnected'
    case 'error':
      return 'Error'
  }
}

export function MarketHeader(props: {
  connection: ConnectionState
  stats: MarketStats
  /** One row per subscribed pair; same `trades` tape is filtered inside each strip. */
  pulse?: {
    symbolUpper: string
    book: BookTop | null
    trades: NormalizedTrade[]
    depth: PartialDepthBook | null
  }[]
  ticker24hBySymbol: Record<string, Ticker24hRow>
  ticker24hError: string | null
}) {
  const { connection, stats, pulse, ticker24hBySymbol, ticker24hError } = props

  return (
    <header className="market-header">
      <div className="market-header-inner">
        <div className="market-header-brand">
          <h1 className="market-heading">Binance Spot Data Dashboard</h1>
          <span className={`conn conn-${connection}`}>
            {connLabel(connection)}
          </span>
        </div>

        <div className="market-telemetry" aria-label="Connection metrics">
          <div className="telemetry-item">
            <span className="telemetry-label">Msgs/s</span>
            <span className="telemetry-value mono">{stats.msgsPerSec}</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">Flushes/s</span>
            <span className="telemetry-value mono">{stats.flushesPerSec}</span>
          </div>
          <div className="telemetry-item">
            <span className="telemetry-label">Reconnects</span>
            <span className="telemetry-value mono">{stats.reconnectCount}</span>
          </div>
        </div>
      </div>
      {pulse && pulse.length > 0 ? (
        <div className="pair-desk-strip-stack">
          <div
            className="pair-desk-strip-scroll"
            aria-label="Per-pair pulse and session metrics"
          >
            <div className="pair-desk-strip-track">
              {pulse.map((row, i) => (
                <div
                  key={row.symbolUpper}
                  className="pair-desk-strip-cell"
                >
                  <PairDeskCard symbolUpper={row.symbolUpper}>
                    <PulseStrip
                      symbolUpper={row.symbolUpper}
                      book={row.book}
                      trades={row.trades}
                      depth={row.depth}
                      connection={connection}
                    />
                    <div className="pair-desk-meta-row">
                      <SessionStrip
                        symbolUpper={row.symbolUpper}
                        trades={row.trades}
                      />
                      <Ticker24hStrip
                        symbolUpper={row.symbolUpper}
                        ticker={ticker24hBySymbol[row.symbolUpper]}
                        error={i === 0 ? ticker24hError : null}
                      />
                    </div>
                  </PairDeskCard>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}
