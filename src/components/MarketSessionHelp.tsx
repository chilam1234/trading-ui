import { memo } from 'react'

/** Collapsible long-form help; static props — memo avoids parent re-renders touching subtree. */
export const MarketSessionHelp = memo(function MarketSessionHelp() {
  return (
    <details className="market-session-help">
      <summary className="market-session-help-summary">
        How data and layout work
      </summary>
      <div className="market-session-help-body subtle">
        <p>
          Data from{' '}
          <a
            href="https://developers.binance.com/docs/binance-spot-api-docs/web-socket-streams"
            target="_blank"
            rel="noreferrer"
          >
            Binance Spot WebSocket
          </a>
          . Use <strong>Markets</strong> to add USDT pairs from <code>exchangeInfo</code>; use{' '}
          <strong>Stream pairs</strong> to opt in or out for the tape and order books (the socket still
          carries every subscribed stream). Order books scroll horizontally; drag a book’s title row to
          reorder cards in the strip and the right edge to resize width. Only visible ladders mount
          so off-screen books do not re-render every tick.
          Updates are coalesced to one React commit per frame (
          <code>requestAnimationFrame</code>). Depth uses partial book <code>@depth10@100ms</code>.
          Drag the top bar (title + grip) on order books and tape, or the chart title (e.g. ETH/USDT · 1m),
          to reorder sections (saved in this browser). Each subscribed market gets{' '}
          <code>@kline_1m</code>; use the pair tabs above the chart to switch instruments (choice saved in
          this browser). Candles from{' '}
          <code>@kline_1m</code> via{' '}
          <a
            href="https://github.com/tradingview/lightweight-charts"
            target="_blank"
            rel="noreferrer"
          >
            lightweight-charts
          </a>
          .
        </p>
        <p>
          <strong>Pulse</strong> shows mid/spread, short-window aggressive flow (print bias), and book
          imbalance (not investment advice). <strong>Session</strong> aggregates tape in the
          in-memory buffer (VWAP, hi/lo, largest print notional). <strong>24h</strong> is from Binance
          REST <code>ticker/24hr</code> (refreshed periodically). The chart can show{' '}
          <strong>SMA(20)</strong> on closes — educational; it does not predict returns or recommend
          trades.
        </p>
      </div>
    </details>
  )
})
