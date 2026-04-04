import { useMemo } from 'react'
import { formatPairLabel } from '../lib/binance/formatPairLabel'
import { computePulseMetrics } from '../lib/pulse/pulseMetrics'
import type {
  BookTop,
  ConnectionState,
  NormalizedTrade,
  PartialDepthBook,
} from '../lib/binance/types'

function formatPrice(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  })
}

function formatSpreadBps(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
}

function formatSkew(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(2)}`
}

export function PulseStrip(props: {
  symbolUpper: string
  book: BookTop | null
  trades: NormalizedTrade[]
  /** Partial depth book for primary symbol (e.g. `@depth10@100ms`). */
  depth: PartialDepthBook | null
  flowWindow?: number
  depthTopLevels?: number
  connection: ConnectionState
}) {
  const {
    symbolUpper,
    book,
    trades,
    depth,
    flowWindow,
    depthTopLevels,
    connection,
  } = props

  const m = useMemo(
    () =>
      computePulseMetrics(
        book,
        trades,
        symbolUpper,
        flowWindow,
        depth,
        depthTopLevels,
      ),
    [book, trades, symbolUpper, flowWindow, depth, depthTopLevels],
  )

  const pairHuman = formatPairLabel(symbolUpper)
  const degraded = connection !== 'open'
  const totalVol = m.buyVol + m.sellVol
  const sellPct = totalVol > 0 ? m.sellVol / totalVol : 0
  const buyPct = totalVol > 0 ? m.buyVol / totalVol : 0

  const depthTotal = m.depthBidNotional + m.depthAskNotional
  const depthBidPct = depthTotal > 0 ? m.depthBidNotional / depthTotal : 0
  const depthAskPct = depthTotal > 0 ? m.depthAskNotional / depthTotal : 0

  const ariaLabel = `Pulse: mid, spread, print bias, and book imbalance for ${pairHuman}`

  return (
    <section
      className={`pulse-strip${degraded ? ' pulse-strip--degraded' : ''}`}
      aria-label={ariaLabel}
    >
      <header className="pulse-strip-pair">
        <span className="pulse-pair-label">{pairHuman}</span>
      </header>

      <div className="pulse-cluster pulse-cluster--mid">
        <span className="pulse-micro-label">Mid</span>
        <span className="pulse-mid-value mono">
          {m.mid !== null ? formatPrice(m.mid) : '—'}
        </span>
      </div>

      <div className="pulse-cluster pulse-cluster--spread">
        <span className="pulse-micro-label">Spr</span>
        <span className="pulse-spread-line mono">
          {m.spread !== null && m.spreadBps !== null ? (
            <>
              <span className="pulse-spread-abs">{formatPrice(m.spread)}</span>
              <span className="pulse-spread-sep" aria-hidden>
                {' '}
              </span>
              <span className="pulse-spread-bps">
                {formatSpreadBps(m.spreadBps)} bps
              </span>
            </>
          ) : (
            '—'
          )}
        </span>
      </div>

      <div className="pulse-cluster pulse-cluster--flow">
        <span className="pulse-micro-label">Print bias</span>
        <div className="pulse-flow-row">
          <div
            className="pulse-meter-track"
            role="img"
            aria-label={
              totalVol > 0
                ? `Aggressive flow skew ${formatSkew(m.flowSkew)}`
                : 'No prints in window yet'
            }
          >
            <div
              className="pulse-meter-sell"
              style={{ width: `${sellPct * 50}%` }}
            />
            <div
              className="pulse-meter-buy"
              style={{ width: `${buyPct * 50}%` }}
            />
          </div>
          <span className="pulse-skew-num mono">
            {m.tradesInWindow > 0 ? formatSkew(m.flowSkew) : '—'}
          </span>
        </div>
      </div>

      <div className="pulse-cluster pulse-cluster--depth">
        <span className="pulse-micro-label">Book</span>
        <div className="pulse-flow-row">
          <div
            className="pulse-meter-track pulse-meter-track--depth"
            role="img"
            aria-label={
              m.hasDepth
                ? `Resting liquidity skew ${formatSkew(m.depthSkew)} (left asks, right bids)`
                : 'No depth snapshot yet'
            }
          >
            <div
              className="pulse-meter-depth-ask"
              style={{ width: `${depthAskPct * 50}%` }}
            />
            <div
              className="pulse-meter-depth-bid"
              style={{ width: `${depthBidPct * 50}%` }}
            />
          </div>
          <span className="pulse-skew-num mono">
            {m.hasDepth ? formatSkew(m.depthSkew) : '—'}
          </span>
        </div>
      </div>
    </section>
  )
}
