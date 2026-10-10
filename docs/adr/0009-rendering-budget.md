# ADR-0009: Rendering budget & memory-adaptive repaint

Date: 2026-10-10
Status: Accepted (implementation pending)
Deciders: Billy Chan + Hermes agent
Related: ADR-0004 (canvas charts & design tokens)

## Context

The dashboard was observed ballooning a Chrome renderer to 1.4–5.1GB (tab-hover), freezing
at ~5 min, then being OOM-killed ("Aw, Snap", error 5/6). Verified in a controlled
reproduction on 2026-10-10 (see /tmp/watchdog.log, /tmp/run3b.log, /tmp/leak3171.txt):

- Data caps are correct (trades 600/pair, klines 400/symbol, DOM census stable); the JS heap
  stays tiny (16–36MB in dev, 10MB in prod). The cost is NATIVE transient memory from
  full-surface canvas repaints at 2× DPR + dev-mode churn (StrictMode ×2 renders, dev chart
  bundle, DEV PERF restyling ≈15/s).
- The prod build (vite preview :4173) runs 75MB flat at 405 msgs/s — the data pipeline is
  healthy; the *render policy* is the problem.
- Main-thread samples: ~25% CPU in JIT'd app JS from first load, painting through CoreText.

Full-surface repaint of 7 visible canvases at 1600×1200×2× DPR ≈ 15MB of transient buffer per
frame burst; at unthrottled rAF (60fps against 350 WS msgs/s) the GC loses the race and the
renderer is killed. On memory-constrained machines this is worse.

## Decision

Adopt a rendering budget with five layers, applied to chart/tape/ladder canvases:

1. **Frame-budget throttle (repaint slots).** All canvas work happens in a shared rAF loop
   with per-class fps caps: kline chart 5 fps, depth ladder 10 fps, tape 5 fps, bookTicker
   strip 10 fps. Data arrival only sets a *dirty* flag. A frame paints a panel only if
   dirty AND its interval elapsed. Never paint on message arrival.
2. **Repaint only visible panels.** IntersectionObserver on each panel; non-intersecting
   panels are skipped in the rAF loop (dirty flag preserved for the next entrance).
3. **DPR cap 1.5.** Canvas backing stores use `Math.min(devicePixelRatio, 1.5)` for chart/
   ladder/tape canvases. "Low-memory mode" (user toggle, persisted) reduces this to 1.
4. **DOM/text churn budget.** The tape renders at most 30 rows and updates text nodes in
   place (no teardown/key churn); the DEV PERF overlay updates at 1 Hz and only when
   `?perf=1` or dev. RecalcStyleCount must not grow unbounded (assert in dev-perf HUD).
5. **Backpressure shed.** If rAF gap > 500 ms (tab busy/background), shed intermediate
   depth snapshots (keep latest per pair) and coalesce kline merges; catch-up flush runs
   at most once per 250 ms. No unbounded queue catch-up.

Non-goals: replacing lightweight-charts; server-side changes beyond none (fanout already
supports per-session pruning); changing data caps from ADR-0004/mem-audit.

## Alternatives considered

- WebGL/WebGPU single-buffer compositor: max control, max scope. Deferred until >30 charts
  are a real use case.
- Server-side down-sampling (gateway paints? no — keep transport raw).
- Shipping only prod to users: dev UX stays unusable for long sessions, which is the actual
  complaint; rejected.

## Consequences

- Worst-case render memory target: <300MB renderer peak, even in dev, on 2× DPR.
- Charts may show up to 200–333 ms staleness (5 fps) — acceptable for candles; ladder at
  10 fps remains readable.
- A visible "render paused (off-screen)" indicator is NOT shown; frozen panels simply
  resume on intersection.
- Tests: vitest for slot/dirty/throttle logic (fake rAF), and a mem-retention regression
  case asserting paint-count ≤ fps-cap over simulated 60 s at 10× data rate.