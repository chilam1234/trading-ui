# trading-ui

A real-time trading interface for a limit order book: live trades, order books,
candles and liquidity, rendered on a capped frame budget instead of React's
default render rate.

Built as the client for [clob-lab](https://github.com/chilam1234/clob-lab) — a
Java CLOB matching engine that speaks a Binance-compatible WebSocket dialect — and
it also runs against live Binance streams unmodified.

React 19 · TypeScript · Vite · lightweight-charts · Vitest

## Why this is not a normal React app

At a few hundred messages per second, the naive approach — one `useState` per
message, re-render per frame — burns the main thread and grows memory without
bound. This app is built around three rules.

**1. Data arrives on a worker, not the main thread.**
Raw frames go to `src/workers/marketParse.worker.ts`, which parses and batches
them (16ms window, capped queues, chunked `postMessage`) so JSON parsing and
normalisation never compete with painting. A direct-parse fallback exists for
environments without `Worker`.

**2. State updates once per animation frame, not once per message.**
Messages accumulate in refs; a single rAF flush merges them
(`mergeTradeBatchIntoPrev`, `mergeKlineIntoCandles`), dedupes against the head of
the existing list, and applies one `setState` per data type. Under a rAF gap (busy
tab, background, GC pause) the flush sheds: klines are coalesced, trade batches are
hard-capped, and depth keeps only the latest snapshot per pair.

**3. Panels paint on a shared budget, at their own rate.**
`src/lib/render/budget.ts` is one rAF loop for every panel. Each panel registers an
fps and a `paint` callback; data arrival only sets a dirty flag. Charts paint at
5fps, ladders at 10fps, and a panel scrolled out of the viewport keeps its dirty
flag but skips painting entirely. A panel whose `paint` throws is isolated — it
logs once and the shared loop keeps running for everything else.

The consequence: a new trade does not re-render React. The tape renders exactly 30
DOM rows (`TAPE_VISIBLE_ROWS`), created once, then updates text nodes in place
through refs — zero React renders per row.

## Layout

```
src/
  hooks/useBinanceMarket.ts     ingest pipeline: WS → refs → rAF flush → state
  hooks/useBinanceMarket/       pure, tested helpers (merge, dedupe, allowlists)
  workers/marketParse.worker.ts off-main-thread parsing + batching
  lib/render/budget.ts          shared rAF scheduler + fps slots
  lib/render/candleUpdate.ts    candle fast-path planning (hash-based)
  components/                   chart, tape, ladder, pulse, session panels
  docs/adr/0009-*               rendering budget decision record
  docs/mem-audit.md             memory audit with file:line evidence
```

## Run

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
npm run preview      # serves the production build — use this for perf work
npm test             # vitest
```

Environment (`.env.local`, all optional):

| Variable | Default | Purpose |
|---|---|---|
| `VITE_BINANCE_HOST` | `wss://stream.binance.com:9443` | Upstream socket (a clob-lab gateway uses `ws://localhost:8081`) |
| `VITE_PRIMARY_SYMBOL` | — | Symbol for the chart panel (`clobusdt` against clob-lab) |
| `VITE_MARKET_SOURCE` | `direct-binance` | Set to `backend-fanout` to consume a fanout server instead |
| `VITE_FANOUT_WS_URL` | `ws://127.0.0.1:8787/ws` | Fanout server address |

## Tests

```bash
npm test        # 66 tests across 15 files
```

Covered: trade merge and dedupe (including the worker dedupe-ring gap), kline
merge, depth flush selection, stream allowlists, render budget scheduling and its
failure isolation, candle fast-path planning, memory-retention regressions, SMA.

## Performance notes

`docs/mem-audit.md` is a static audit of every retention path in the ingest layer,
with a file:line citation per finding and an explicit list of what was checked and
cleared. `docs/adr/0009-rendering-budget.md` records why the render budget is one
shared rAF loop rather than per-panel loops.

Measured on the production build against the clob-lab mock feed: JS heap ~10MB with
renderer RSS flat, versus a development build that climbs into the gigabytes from
StrictMode double-rendering plus dev-only instrumentation. Measure with `preview`,
not `dev`.
