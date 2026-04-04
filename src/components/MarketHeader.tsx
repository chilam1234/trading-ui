import type {
  BookTop,
  ConnectionState,
  NormalizedTrade,
  PartialDepthBook,
} from '../lib/binance/types'
import type { MarketStats } from '../hooks/useBinanceMarket'
import { PulseStrip } from './PulseStrip'

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
}) {
  const { connection, stats, pulse } = props

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
        <div className="pulse-strip-list">
          {pulse.map((row) => (
            <PulseStrip
              key={row.symbolUpper}
              symbolUpper={row.symbolUpper}
              book={row.book}
              trades={row.trades}
              depth={row.depth}
              connection={connection}
            />
          ))}
        </div>
      ) : null}
    </header>
  )
}
