# trading-ui

A trading interface for a limit order book. It shows live trades, order books,
candles and liquidity, and it renders on its own frame budget instead of React's.

This is the client for [clob-lab](https://github.com/chilam1234/clob-lab), a Java
matching engine that serves a Binance-compatible WebSocket feed. It also runs
against live Binance streams.

React 19, TypeScript, Vite, lightweight-charts, Vitest.

## The problem it solves

A few hundred messages per second will not survive the default React approach of
one state update and one render per message. The main thread ends up parsing JSON
instead of painting, and the heap grows because every frame allocates new arrays.

Three changes fixed that.

**Parsing moved off the main thread.** `src/workers/marketParse.worker.ts` receives
raw frames, parses them, and posts batches back in a 16ms window. Queues have caps,
and large batches are chunked so a `postMessage` never has to clone thousands of
objects at once. Environments without `Worker` fall back to parsing in place.

**State updates once per animation frame.** Messages collect in refs. One rAF flush
merges them (`mergeTradeBatchIntoPrev`, `mergeKlineIntoCandles`), dedupes against
the head of the existing list, and calls `setState` once per data type. If a frame
takes too long, the next flush sheds work: klines get coalesced, the trade batch is
capped, and depth keeps one snapshot per pair.

**Panels paint from a shared budget.** `src/lib/render/budget.ts` runs one rAF loop
for the whole app. A panel registers an fps and a paint callback, and incoming data
only sets a dirty flag. Charts paint at 5fps and ladders at 10fps. A panel scrolled
out of view keeps its dirty flag and skips painting. When a paint throws, it logs
once and the loop keeps running for the other panels.

So a new trade does not re-render React. The tape creates 30 DOM rows
(`TAPE_VISIBLE_ROWS`) and writes text nodes through refs from then on.

## Layout

```
src/
  hooks/useBinanceMarket.ts     ingest pipeline: socket -> refs -> rAF flush -> state
  hooks/useBinanceMarket/       pure helpers, tested (merge, dedupe, allowlists)
  workers/marketParse.worker.ts parsing and batching off the main thread
  lib/render/budget.ts          shared rAF scheduler with fps slots
  lib/render/candleUpdate.ts    candle fast-path planning (hash based)
  components/                   chart, tape, ladder, pulse, session panels
  docs/adr/0009-*               why the render budget is one loop
  docs/mem-audit.md             retention audit with file and line evidence
```

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
npm run preview      # serves the production build; measure here, not in dev
npm test             # vitest
```

`.env.local` is optional. Every variable has a default:

| Variable | Default | Purpose |
|---|---|---|
| `VITE_BINANCE_HOST` | `wss://stream.binance.com:9443` | Upstream socket. A clob-lab gateway uses `ws://localhost:8081` |
| `VITE_PRIMARY_SYMBOL` | none | Symbol for the chart panel (`clobusdt` against clob-lab) |
| `VITE_MARKET_SOURCE` | `direct-binance` | Set to `backend-fanout` to consume a fanout server |
| `VITE_FANOUT_WS_URL` | `ws://127.0.0.1:8787/ws` | Fanout server address |

## Tests

`npm test` runs 66 tests across 15 files. They cover trade merge and dedupe
(including the gap in the worker dedupe ring), kline merge, depth flush selection,
stream allowlists, render budget scheduling and its failure isolation, candle
fast-path planning, memory retention and SMA.

## Performance notes

`docs/mem-audit.md` walks every retention path in the ingest layer, cites a file
and line per finding, and lists what was checked and came back clean.
`docs/adr/0009-rendering-budget.md` explains the single-loop decision.

Against the clob-lab mock feed on a production build, the JS heap sits around 10MB
with renderer RSS flat. A development build climbs into the gigabytes from
StrictMode double rendering and dev-only instrumentation, which is why `preview`
is the one to measure.
