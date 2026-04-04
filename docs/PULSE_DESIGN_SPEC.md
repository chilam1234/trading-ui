# Pulse — design & implementation spec

This document defines **visual direction**, **design tokens**, **component contract**, and **implementation phases** for the Pulse strip (Phase 1 MVP). It extends the existing **industrial terminal** language in [`src/index.css`](../src/index.css) and [`src/App.css`](../src/App.css).

---

## 1. Design direction summary

| Field | Choice |
|-------|--------|
| **Aesthetic name** | **Industrial terminal — “liquidity rail”** (dense, asymmetric emphasis: flow > price > spread) |
| **Tone** | Industrial / utilitarian (dominant) + one sharp accent (flow meter) |
| **Purpose** | Functional: read **mid, spread, and short-window flow bias** in &lt; 2 seconds without scanning the tape |
| **Differentiation anchor** | A **single horizontal flow meter** (buy vs sell pressure) with **tabular numerics** and **uppercase micro-labels** — reads like exchange infrastructure, not a generic SaaS metric card |

### DFII (Design Feasibility & Impact Index)

| Dimension | Score (1–5) | Notes |
|-----------|-------------|--------|
| Aesthetic impact | 4 | Strong fit with existing grain + mono; Pulse adds one memorable meter |
| Context fit | 5 | Trading / liquidity context; matches `app-terminal` |
| Implementation feasibility | 5 | No new fonts; CSS variables + one new component |
| Performance safety | 5 | CSS transforms only; no per-tick layout thrash if meter updates throttled |
| Consistency risk | 1 | Reuses telemetry patterns from header |

**DFII = 4 + 5 + 5 + 5 − 1 = 18 → cap interpretation as “strong / execute”** (skill range tops at 15; treat as **≥ 12** = excellent fit).

### Differentiation callout

This avoids generic UI by **refusing equal-weight KPI tiles**: Pulse uses **one dominant flow rail**, **one mid price line**, and **spread as secondary** — not three identical cards. Typography follows **label → value** rhythm already used in `.telemetry-*`, not dashboard card grids.

---

## 2. Design system snapshot (Pulse-specific)

### 2.1 Fonts (no change from global)

| Role | Font | Usage in Pulse |
|------|------|----------------|
| Labels / pair | `var(--sans)` IBM Plex Sans | Pair label, section captions |
| Numbers | `var(--mono)` JetBrains Mono | Mid, spread, bps, meter tick labels |

### 2.2 New CSS variables (add to `:root` in `index.css`)

Keep tokens **semantic** so Phase 2 (depth) can reuse them.

```css
/* Pulse strip */
--pulse-rail-h: 6px;
--pulse-rail-track: color-mix(in srgb, var(--border) 85%, transparent);
--pulse-rail-buy: var(--buy);
--pulse-rail-sell: var(--sell);
--pulse-rail-neutral: var(--muted);
--pulse-strip-bg: color-mix(in srgb, var(--panel) 88%, transparent);
--pulse-strip-border: color-mix(in srgb, var(--accent) 18%, var(--border));
```

### 2.3 Color story

- **Dominant:** dark panel (`--panel`, `--bg`) — already global.
- **Accent:** cyan (`--accent`) for **focus ring** and **top border** tie-in with `.market-header`.
- **Semantic:** `--buy` / `--sell` only for **flow direction** and meter fills — never for decoration.

### 2.4 Spacing rhythm

Base unit **4px**. Pulse strip internal padding: **`8px 12px`** (2 / 3 scale steps). Gap between **clusters** (pair+mid | spread | flow): **`12px`** min, wrapping on narrow viewports.

### 2.5 Motion philosophy

- **No** continuous animation on numbers (reduces anxiety and CPU).
- **One** transition: flow meter fill uses **`transform: scaleX()`** on an inner bar (GPU-friendly), duration **`180ms` `ease-out`**, updates **throttled** to **≤ 10 Hz** from parent or derived state.
- **`prefers-reduced-motion: reduce`:** disable meter transition; show **numeric skew only** (e.g. `+0.42`) or static bar.

---

## 3. Component specification

### 3.1 Name & location

- **Component:** `PulseStrip`
- **Path:** `src/components/PulseStrip.tsx`
- **Metrics:** `src/lib/pulse/pulseMetrics.ts` (pure functions; see implementation plan)

### 3.2 Props (TypeScript)

```ts
type PulseStripProps = {
  /** e.g. "BTCUSDT" */
  symbolUpper: string
  /** From book ticker */
  book: BookTop | null
  /** Primary-symbol trades, newest first (same order as hook) */
  trades: NormalizedTrade[]
  /** Max trades to consider for flow skew (default 120) */
  flowWindow?: number
  /** Connection for degraded styling */
  connection: ConnectionState
}
```

### 3.3 DOM structure (semantic)

```html
<section class="pulse-strip" aria-label="Pulse: mid, spread, and flow for {PAIR}">
  <header class="pulse-strip-pair">…</header>
  <div class="pulse-cluster pulse-cluster--mid">…</div>
  <div class="pulse-cluster pulse-cluster--spread">…</div>
  <div class="pulse-cluster pulse-cluster--flow">…</div>
</section>
```

- Use **`<section>`** with **`aria-label`** including human pair (e.g. `BTC/USDT`).
- **Do not** set `aria-live` on the whole strip (too chatty). Optionally `aria-live="polite"` on **connection badge only** when `connection` changes (see §4).

### 3.4 Visual layout

| Cluster | Content | Visual weight |
|---------|---------|----------------|
| **Pair** | Formatted pair string | Small caps label, `--text-h` |
| **Mid** | Single mono line, tabular nums | **Largest** number in strip |
| **Spread** | Absolute + bps | Smaller mono, `--muted` labels |
| **Flow** | Horizontal meter + optional `−1…+1` or % buy | **Secondary** emphasis; color only on rail |

**Asymmetry:** Mid column may use **min-width** so the strip doesn’t jump when digits change (`font-variant-numeric: tabular-nums`).

### 3.5 States

| State | Visual |
|-------|--------|
| `book === null` | Mid / spread show **em dash** or “—”; meter **neutral** (50% gray) |
| `connection !== 'open'` | Entire strip **`opacity: 0.72`**; optional **`.pulse-strip--degraded`** border `--warn` |
| `trades.length === 0` | Flow meter **neutral**; label “No prints yet” in micro copy (optional Phase 1) |

### 3.6 Meter implementation detail

- **Track:** full width of flow cluster; height `var(--pulse-rail-h)`; background `var(--pulse-rail-track)`; `border-radius: 2px`.
- **Fill:** absolutely positioned; width = `50% + 50% * skew` where `skew ∈ [−1, 1]`; transform-origin **center**; color: gradient is **not** used — **solid** buy or sell side from center:
  - **Implementation choice:** single div with `linear-gradient` **or** two half-tracks; prefer **one flex row** with `flex: buyPct` / `flex: sellPct` for simplicity and a11y (no fake gradients).

Recommended **simple** pattern:

```text
[ sell volume ][ neutral gap ][ buy volume ]
```

Actually for skew −1..+1: show **one bar** from center: left = sell pressure, right = buy pressure (mirror of standard tape bias). Spec: **bar fill from center**, green right / red left.

---

## 4. Accessibility

| Requirement | Implementation |
|-------------|------------------|
| Contrast | Text uses existing `--text-h` / `--muted`; meter not sole indicator — duplicate **numeric skew** next to meter |
| Keyboard | Strip is informational; **no** focusable controls in Phase 1 |
| Screen readers | `aria-label` on section; numeric values in **visible** text (not `title` only) |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` — meter width jumps without transition |

---

## 5. Integration points

| File | Change |
|------|--------|
| `MarketHeader.tsx` | Render `<PulseStrip />` **below** brand row or **between** brand and telemetry — match `flex-wrap` on `.market-header-inner` |
| `MarketSession.tsx` | Pass `bookTopBySymbol[primarySymbol]`, filtered trades for `primarySymbol`, `connection` |
| `App.css` | Add `.pulse-*` rules; no duplication of `.telemetry-*` — reuse label style via shared class **or** duplicate micro-label rules once |

---

## 6. Phased implementation (design ↔ engineering)

| Phase | Engineering | Design deliverable |
|-------|-------------|-------------------|
| **1a** | `pulseMetrics.ts`: mid, spread, spreadBps, flowSkew (−1…1) from `BookTop` + trades | Static strip layout in CSS |
| **1b** | `PulseStrip.tsx` + wire props | Meter + degraded states |
| **1c** | Throttle meter updates (e.g. `requestAnimationFrame` batch or 100 ms) | Motion + `prefers-reduced-motion` |
| **2** | Depth imbalance from `PartialDepthBook` | Second meter or replace flow formula — **spec extension** (reuse `--pulse-rail-*`) |

---

## 6.1 Copy (micro)

| Element | EN copy |
|---------|---------|
| Flow label | `FLOW` or `PRINT BIAS` |
| Spread label | `SPR` |
| Mid label | `MID` |
| Empty book | `—` |

---

## 7. Anti-patterns (do not ship)

- Three equal-width “cards” for mid / spread / flow.
- Purple gradients or **Inter** / Roboto (project uses IBM Plex + JetBrains).
- Animating **price digits** every tick.
- Flow meter **without** numeric backup.

---

## 8. Checklist before merge

- [ ] DFII rationale acknowledged (industrial terminal continuity).
- [ ] All new colors via **CSS variables** in `:root`.
- [ ] `tabular-nums` on all numeric outputs.
- [ ] Degraded + empty book states visible.
- [ ] Reduced motion respected.
- [ ] No new dependencies.
