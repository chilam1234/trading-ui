# trading-ui Memory Audit — Static Source Analysis

*2026-10-05 · subagent static audit (no live Chrome, no dev server, no profiling) · companion regression suite: `src/mem-retention.test.ts`*

Context: tab at `http://localhost:5173` grows to 1.4GB+ (Chrome renderer RSS ~824MB) while streaming ~90 aggTrade/s + kline + depth + bookTicker from the local gateway (high frame rate, 100+ frames/s). This audit reads the source and identifies memory-retention patterns with file:line evidence; the live-heap analysis is owned by the parent agent's concurrent CDP probe.

---

## Executive ranking

| # | Finding | Severity | Where |
|---|---------|----------|-------|
| 1 | **Worker dedupe ring (RECENT_TRADE_KEYS_CACHE=8192) is the *only* dedup in worker mode** — evicted ids are re-accepted and re-published; main-thread merge skips dedup entirely in workerMode | likely-major (correctness/perf churn, not unbounded growth) | `marketParse.worker.ts:13-47`, `mergeTradesBatch.ts:14-18` |
| 2 | **Non-worker merge dedup window (512) < tape cap (600)** — dupes in rows 512-600 are re-published into React state | minor | `marketIngestConstants.ts:2,19`, `mergeTradesBatch.ts:21-35` |
| 3 | **Per-flush full-array rebuilds at high frequency** — every rAF flush allocates fresh 600-row arrays / records (GC churn, RSS pressure) | minor (GC pressure, bounded) | `mergeTradesBatch.ts:15-41`, `useBinanceMarket.ts:225-232,237-249,267-290,294-305` |
| 4 | **`partialDepthContentKey` O(levels) string join per depth frame** — 10+ frames/s × 10-12 streams × 20 levels joined twice (once in worker, again at publish + every memo equality check) | minor (churn) | `partialDepthContentKey.ts:4-9`, `OrderBook.tsx:222`, `applyPartialDepthFlush.ts:51` |
| 5 | **`candlesBySymbol`/`trades`/`partialDepthByStream` records copied wholesale per changed key** — `{...prev}` per flush per record even when only one symbol changed | minor | `useBinanceMarket.ts:237-306`, `filterRecordByAllowlist.ts:14-18` |
| 6 | Every flush re-allocates `computeStreamAllowlists` (3 new Sets) + full `pruneIngestRefMaps` object spread | minor | `useBinanceMarket.ts:325-341`, `streamAllowlists.ts:13-26` |

**Not found (verified bounded — see "Bounded paths" below):** trades tape (600 cap, enforced), candles (400 cap, enforced), depth maps (stream allowlist pruning works, key scope survives symbol switches by allowlist rebuild), pending buffers (all hard-capped + drain-now), worker dedupe ring (8192 cap, FIFO eviction), React tape (virtualized), WS reconnect paths (worker+socket+timers all cleaned on close), `useTicker24h`/`useUsdtSymbolCatalog`/`useSessionDeskMetrics`/`useFrameTimeSampler`/`useLongTaskObserver` (fixed-size or interval-cleared).

---

## Evidence per finding

### 1. Worker dedupe ring is the only dedup in worker mode (likely-major)

- `src/workers/marketParse.worker.ts:13-15` — `RECENT_TRADE_KEYS_CAP = 8_192`, module-level `recentTradeKeys` Set + `recentTradeQueue` FIFO.
- `src/workers/marketParse.worker.ts:38-47` — `rememberTradeKey` evicts the oldest key once past the cap; an evicted id is re-accepted as NEW on the next frame. Regression: B1 in `src/mem-retention.test.ts` (currently FAILS = bug real).
- `src/hooks/useBinanceMarket/mergeTradesBatch.ts:14-18` — in `workerMode: true` the main-thread merge **skips dedup entirely** (`batch.slice().reverse()` + cap only). The worker ring (8192, i.e. ≈ 91s at 90 trades/s) silently trades exact-dedup correctness for bounded memory.

**Why it matters for memory** — it isn't unbounded, but duplicate tape rows force extra React renders + keyed reconciliation churn on every flush; under 100+ frames/s that is measurable allocation pressure (see finding 3's amplification).

**Fix**: in `mergeTradeBatchIntoPrev`, do the `prevDedupHead` scan in the workerMode branch too (window is only 512 keys — cost is trivial vs. the dedup guarantee), OR bump `RECENT_TRADE_KEYS_CAP` AND make the ring key-scope per-stream (`symbol:id` is already the key — the ring is global across symbols, fine). Prefer dedup-on-merge: it makes dedup correctness independent of ring size.

### 2. Non-worker merge dedup window (512) < tape cap (600) (minor)

- `src/hooks/useBinanceMarket/marketIngestConstants.ts:2,19` — `MAX_TRADES = 600`, `PREV_DEDUP_HEAD = 512`.
- `src/hooks/useBinanceMarket/mergeTradesBatch.ts:21-35` — dedup scans only the newest 512 rows of `prev`; trades already resident in rows 512-600 are re-accepted. Regression: B3 FAILS vs current code.
- Impact: duplicates in the bottom 88 rows of the tape re-render as extra rows until they age out — bounded, but a latent data-correctness bug (dupes in the visible tape at the cap boundary).

**Fix**: set `PREV_DEDUP_HEAD` ≥ `MAX_TRADES` (600) — one constant. The O(512→600) scan cost is negligible.

### 3. Per-flush full-array/record rebuilds (minor, GC churn — bounded but hot at 100+ frames/s)

- `src/hooks/useBinanceMarket/mergeTradesBatch.ts:17,39-40` — `[...incoming, ...prev]` allocates a fresh ≤600-row array **every flush that has trades**.
- `src/hooks/useBinanceMarket/useBinanceMarket.ts:225-232` — the trades record path does this at up to `flushesPerSec` ≈ rAF rates (60/s) plus `runFlushNow` overflow flushes (PENDING_TRADES_FLUSH_NOW=320 / WS_MSGS_FLUSH_NOW=160).
- `src/hooks/useBinanceMarket/useBinanceMarket.ts:237-249,267-290,294-305` — same pattern for `bookTopBySymbol`, `partialDepthByStream`, `candlesBySymbol`: `{...prev}` per changed record per flush.
- Every 1s window (`useBinanceMarket.ts:158-203`) also allocates fresh `computeStreamAllowlists` Sets + a fresh object literal for `pruneIngestRefMaps` (`useBinanceMarket.ts:325-341`, `streamAllowlists.ts:13-26`).

Bounded (nothing grows without a cap), but at ~60-100 flushes/s with 6-12 symbols this is thousands of short-lived array/record/set allocations per second — the allocator churn shows up as RSS growth before GC catches up.

**Fix** (incremental, no semantic change): use in-place Map-based state (e.g. `Map<string, ...>` + `version` counter in state to trigger renders), so only the changed entries are touched per flush. Lower priority than 1-2 because the live-heap probe will show this as **allocation churn with stable heap** (RSS oscillation), not monotonic growth.

### 4. `partialDepthContentKey` joins all 20 levels into a string per depth frame (minor, churn)

- `src/lib/binance/partialDepthContentKey.ts:4-9` — `${idKey}\n${bidPart}\n${askPart}` with `map + join('\n')` for both sides.
- Called: once per parsed frame in the worker (`marketParse.worker.ts:151`, `envelopeToWorkerBatch.ts:46`), again per publish in `applyPartialDepthFlush.ts:51` (only when pending key missing), and **per memo equality check** in `OrderBook.tsx:222` — i.e., re-serialized for every `OrderBook` prop comparison on every parent render, even when depth is unchanged.

**Fix**: `orderBookPropsEqual` should compare the depth reference identity + `lastUpdateIdStr` (publish pipeline already guarantees new objects per content change — `applyPartialDepthFlush` skips same-key publishes). Fallback: cache the content key on the book object itself (`WeakMap<PartialDepthBook, string>`).

### 5. Record spread per changed key (minor — same mechanism as 3)

`filterRecordByAllowlist.ts:14-18` copies the whole record on any key drop post-symbol-switch; `useBinanceMarket.ts:343-353` calls it on every flush even when nothing changed (cheap no-op return, but still 3 function calls + closure allocs per flush). Fine to leave; listed for completeness.

---

## Bounded paths — verified, no action needed

| Path | Cap / mechanism | Where verified |
|---|---|---|
| Trades tape (React state) | `MAX_TRADES = 600` enforced in `mergeTradeBatchIntoPrev` (both modes) | `marketIngestConstants.ts:2`, `mergeTradesBatch.ts:16-18,38-40`; test A1 |
| Main-thread pending trades | 320 flush-now threshold + rAF (bounded at ≥320 even when rAF is busy — `runFlushNow` is synchronous) | `marketIngestConstants.ts:7`, `useBinanceMarket.ts:362-370,432-439`; test A1 exercises drain |
| Worker pending trades/klines | `MAX_PENDING_TRADES_WORKER = 2500`, `MAX_PENDING_KLINES_WORKER = 400` + `splice` drop + sync `flushBatch` on crossing | `marketParse.worker.ts:24-25,129-131,161-163`; test B2 |
| Worker postMessage batch size | `MAX_TRADES_PER_POST = 200`, `MAX_KLINES_PER_POST = 200` chunking (no giant structured clones) | `marketParse.worker.ts:29-30,66-79` |
| Worker dedupe ring | `RECENT_TRADE_KEYS_CAP = 8192` FIFO (bounded, but see finding 1 for correctness) | `marketParse.worker.ts:13-47`; test B1 (bound verified, correctness failed) |
| Candles (kline merge) | `MAX_CANDLES = 400` enforced in `mergeKlineIntoCandles`; same-time update replaces in place without growth | `klineMerge.ts:4,42-44`; test A3 |
| Depth ref maps (worker→main) | All 7 maps + 2 sets pruned per flush via `pruneIngestRefMaps` against `computeStreamAllowlists(streamsSnapshot)` — the pruning key scope is the CURRENT effect closure's `streamsSnapshot`, so a symbol switch (new effect run, fresh refs at `useBinanceMarket.ts:126-148`) or stream change prunes stale stream-id keys | `pruneIngestRefMaps.ts:20-65`, `useBinanceMarket.ts:126-148,325-341`; test A2 (incl. post-switch prune check) |
| React state records on switch | `filterRecordKeepingKeys` per flush keeps only allowlisted keys | `filterRecordByAllowlist.ts:1-19`, `useBinanceMarket.ts:343-353`; test A2 |
| Tape rendering | Virtualized (`@tanstack/react-virtual`, overscan 16) | `TradeTape.tsx:153-161` |
| Frame sampler ring | `RING = 180` shift-popped | `useFrameTimeSampler.ts:3,45-46` |
| Long-task window | 10s sliding filter + 2s sweep interval, cleared on unmount | `useLongTaskObserver.ts:20-66` |
| WS reconnect / worker lifecycle | `onclose` terminates worker (`useBinanceMarket.ts:611-628`), effect cleanup nulls handlers, closes ws, clears reconnectTimer + rAF (`useBinanceMarket.ts:633-662`); `connect()` also terminates any stale worker before re-create (`useBinanceMarket.ts:477-480`) | read-verified |
| Session/ticker hooks | `setInterval` cleared, `cancelled` flags, no unbounded accumulation | `useTicker24h.ts:22-56`, `useSessionDeskMetrics.ts:31-36`, `useUsdtSymbolCatalog.ts:11-29` |

Key design note: the effect keyed on `[streams, streamsKey, …]` (`useBinanceMarket.ts:126,663`) **re-instantiates every ref map** on any symbol/subscription change (`useBinanceMarket.ts:126-148`) and resets React state records to `{}` in a microtask (`useBinanceMarket.ts:142-147`). Stale stream keys therefore cannot accumulate across symbol switches — the `pruneIngestRefMaps` per-flush pass guards only within-stream (e.g. an interim combined-URL error, stale worker tail) which is the correct scope. **The wrong-key-scope bug class the audit was asked to check is not present upstream of the React state.**

---

## Regression suite (`src/mem-retention.test.ts`)

Run: `npx vitest run src/mem-retention.test.ts`

```
 ❯ src/mem-retention.test.ts (6 tests | 2 failed) 1436ms
     ✓ A1: 200k trades through mergeTradeBatchIntoPrev (worker mode) stay capped at MAX_TRADES 14ms
     ✓ A2: 200k depth books through applyPartialDepthFlush keep ref maps + React record bounded 168->193ms
     ✓ A3: 200k unique klines through mergeKlineIntoCandles stay capped at MAX_CANDLES=400 1169ms
     × B1: worker dedupe ring REJECTS an already-published aggTrade id re-fed after ring eviction 57ms
     ✓ B2: pendingKlines tail stays publishable after worker drain (no silent kline drop on cap crossing) 1ms
     × B3: mergeTradeBatchIntoPrev non-worker dedupe catches duplicates anywhere in prev (not just head) 1ms
 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
```

- **A1-A3 (pass)** — bounded-growth proofs through the real merge/prune functions: 200k synthetic trades / depth books / klines stay inside `MAX_TRADES`/depth-map pruning/`MAX_CANDLES` caps.
- **B1 (fails, bug)** — feeds 9001 trades (id 2 re-fed after ring eviction + forced drain): the already-published id is **posted twice** (`postedTwice.length === 2 ≠ 1`). Demonstrates finding 1 in isolation.
- **B2 (pass)** — 401 klines through the worker: no silent drop of the earliest live-candle anchor at the `MAX_PENDING_KLINES_WORKER` crossing.
- **B3 (fails, bug)** — 600-row tape + duplicate id in row 550 (outside the 512-row dedupe head): re-published into React state (`dupCount === 2 ≠ 1`). Demonstrates finding 2 in isolation.

## Fix plan (ordered)

1. **`mergeTradeBatchIntoPrev`**: run the same `prevDedupHead`-based dedup in the `workerMode: true` branch (or set `prevDedupHead >= maxTrades`); fixes B1 + B3 — dedup correctness stops depending on the worker's finite ring.
2. **Set `PREV_DEDUP_HEAD = MAX_TRADES` (600)** in `marketIngestConstants.ts` (minimal one-line version of #1 if you keep worker-mode dedup in the ring instead).
3. **`OrderBook` memo comparator**: compare depth identity + `lastUpdateIdStr` instead of re-serializing all 20 levels per comparison (`partialDepthContentKey` per render is O(levels) string churn).
4. (Optional, RSS-noise-only) Replace per-flush `{...prev}` record spreads with a `Map` + version-counter state so unchanged entries aren't copied, and hoist `computeStreamAllowlists` to a `useMemo` keyed on `streamsKey`.

*(No source was modified by this audit; only `docs/mem-audit.md` and `src/mem-retention.test.ts` were added.)*