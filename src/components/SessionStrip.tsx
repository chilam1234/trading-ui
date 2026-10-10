import { formatPairLabel } from '../lib/binance/formatPairLabel'
import { useSessionDeskMetrics } from '../hooks/useSessionDeskMetrics'
import type { NormalizedTrade } from '../lib/binance/types'

function fmtPrice(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })
}

function fmtVol(n: string | undefined): string {
  if (n === undefined || n === '') return '—'
  const x = Number.parseFloat(n)
  if (!Number.isFinite(x)) return n
  if (x >= 1e9) return `${(x / 1e9).toFixed(2)}B`
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`
  if (x >= 1e3) return `${(x / 1e3).toFixed(2)}K`
  return x.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

export function SessionStrip(props: {
  symbolUpper: string
  trades: NormalizedTrade[]
}) {
  const { symbolUpper, trades } = props
  const desk = useSessionDeskMetrics(symbolUpper, trades)
  const label = formatPairLabel(symbolUpper)

  return (
    <div
      className="session-strip"
      aria-label={`Session tape stats for ${label}`}
    >
      <span className="session-strip-title">Session</span>
      <span className="session-strip-item mono" title="Volume-weighted avg price (tape)">
        <span className="session-micro-label">VWAP</span>
        {fmtPrice(desk.vwap)}
      </span>
      <span className="session-strip-item mono">
        <span className="session-micro-label">Hi</span>
        {fmtPrice(desk.sessionHigh)}
      </span>
      <span className="session-strip-item mono">
        <span className="session-micro-label">Lo</span>
        {fmtPrice(desk.sessionLow)}
      </span>
      <span className="session-strip-item mono">
        <span className="session-micro-label">Max N</span>
        {fmtPrice(desk.largestPrintNotional)}
      </span>
      <span className="session-strip-item mono">
        <span className="session-micro-label">Trades</span>
        {desk.tradeCount.toLocaleString()}
      </span>
    </div>
  )
}

export function Ticker24hStrip(props: {
  symbolUpper: string
  ticker: import('../lib/binance/ticker24h').Ticker24hRow | undefined
  error: string | null
}) {
  const { symbolUpper, ticker, error } = props
  const label = formatPairLabel(symbolUpper)

  if (error) {
    return (
      <div className="ticker24h-strip ticker24h-strip--error" role="status">
        24h: {error}
      </div>
    )
  }

  if (!ticker) {
    return (
      <div className="ticker24h-strip ticker24h-strip--muted" aria-busy>
        24h …
      </div>
    )
  }

  const pct = Number.parseFloat(ticker.priceChangePercent)
  const pctStr = Number.isFinite(pct)
    ? `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`
    : ticker.priceChangePercent

  return (
    <div
      className="ticker24h-strip"
      aria-label={`24 hour change and volume for ${label}`}
    >
      <span className="ticker24h-strip-title">24h</span>
      <span
        className={`ticker24h-pct mono${pct < 0 ? ' ticker24h-pct--down' : ''}${pct > 0 ? ' ticker24h-pct--up' : ''}`}
      >
        {pctStr}
      </span>
      <span className="ticker24h-vol mono" title="Quote volume (USDT)">
        Vol {fmtVol(ticker.quoteVolume)}
      </span>
    </div>
  )
}
