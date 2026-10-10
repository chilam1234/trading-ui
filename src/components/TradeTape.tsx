import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import type { NormalizedTrade } from '../lib/binance/types'
import { formatPairLabel } from '../lib/binance/formatPairLabel'
import { useInViewport } from '../hooks/useInViewport'
import { RENDER_FPS, sharedRenderBudget } from '../lib/render/budget'

/** ADR-0009: at most 30 visible tape rows; slots are reused in place. */
export const TAPE_VISIBLE_ROWS = 30

function FilterIcon() {
  return (
    <svg
      className="tape-pair-filter-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M3 5h18v2H3V5zm2 5h14v2H5v-2zm4 5h6v2H9v-2zm-2 5h10v2H7v-2z"
      />
    </svg>
  )
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  const t = d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const frac = String(d.getMilliseconds()).padStart(3, '0')
  return `${t}.${frac}`
}

type RowSlot = {
  root: HTMLDivElement
  pair: HTMLSpanElement | null
  time: HTMLSpanElement
  side: HTMLSpanElement
  price: HTMLSpanElement
  qty: HTMLSpanElement
}

/**
 * Single tape. Pair visibility is controlled by `selectedPairs`
 * (Stream pairs menu). Only trades whose `symbol` is selected are shown.
 * Rows are fixed slots (max 30); paint updates text nodes in place via the
 * shared render budget (5 fps).
 */
export function TradeTape(props: {
  trades: NormalizedTrade[]
  /** Symbols that have @aggTrade (uppercase). */
  tapeSymbols: readonly string[]
  /** Subset of pairs to show (from Stream pairs menu). */
  selectedPairs: ReadonlySet<string>
}) {
  const { trades, tapeSymbols, selectedPairs } = props
  const wrapRef = useRef<HTMLDivElement>(null)
  const rowsHostRef = useRef<HTMLDivElement>(null)
  const slotsRef = useRef<RowSlot[] | null>(null)
  const reactId = useId()
  const panelId = `tape:${reactId}`

  const tapeAllowed = useMemo(
    () => new Set(tapeSymbols.map((s) => s.toUpperCase())),
    [tapeSymbols],
  )

  const streamSelectedTrades = useMemo(
    () =>
      trades.filter(
        (t) => selectedPairs.has(t.symbol) && tapeAllowed.has(t.symbol),
      ),
    [trades, selectedPairs, tapeAllowed],
  )

  /** Pairs that have @aggTrade and are on in Stream pairs (filter options). */
  const selectableTapeSymbols = useMemo(() => {
    const out: string[] = []
    for (const s of tapeSymbols) {
      const u = s.toUpperCase()
      if (selectedPairs.has(u)) out.push(u)
    }
    return out
  }, [tapeSymbols, selectedPairs])

  const [pairFilter, setPairFilter] = useState<'all' | string>('all')
  const [pairMenuOpen, setPairMenuOpen] = useState(false)
  const pairFilterTriggerRef = useRef<HTMLButtonElement>(null)
  const pairFilterPopoverRef = useRef<HTMLDivElement>(null)
  const pairFilterMenuId = useId()
  const [pairMenuPos, setPairMenuPos] = useState({ top: 0, right: 0 })

  useEffect(() => {
    if (pairFilter === 'all') return
    if (!selectableTapeSymbols.includes(pairFilter)) {
      setPairFilter('all')
    }
  }, [pairFilter, selectableTapeSymbols])

  useLayoutEffect(() => {
    if (!pairMenuOpen) return
    const el = pairFilterTriggerRef.current
    if (!el) return
    const update = () => {
      const r = el.getBoundingClientRect()
      setPairMenuPos({
        top: r.bottom + 6,
        right: window.innerWidth - r.right,
      })
    }
    update()
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [pairMenuOpen])

  useEffect(() => {
    if (!pairMenuOpen) return
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node
      if (pairFilterTriggerRef.current?.contains(t)) return
      if (pairFilterPopoverRef.current?.contains(t)) return
      setPairMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPairMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [pairMenuOpen])

  const filteredTrades = useMemo(() => {
    if (pairFilter === 'all') return streamSelectedTrades
    return streamSelectedTrades.filter((t) => t.symbol === pairFilter)
  }, [streamSelectedTrades, pairFilter])

  const filteredRef = useRef(filteredTrades)
  filteredRef.current = filteredTrades

  /** Keep Pair tags whenever multiple @aggTrade feeds exist, even if Stream pairs filter shows one market. */
  const showPairColumn = tapeSymbols.length > 1
  const showPairColumnRef = useRef(showPairColumn)
  showPairColumnRef.current = showPairColumn

  const showTapePairFilter = selectableTapeSymbols.length > 1

  const hasTapeSelection = useMemo(() => {
    for (const s of tapeSymbols) {
      if (selectedPairs.has(s.toUpperCase())) return true
    }
    return false
  }, [tapeSymbols, selectedPairs])

  const inView = useInViewport(wrapRef)
  const inViewRef = useRef(inView)
  inViewRef.current = inView

  useEffect(() => {
    const ensureSlots = (showPair: boolean): RowSlot[] => {
      const host = rowsHostRef.current
      if (!host) return []
      if (slotsRef.current && slotsRef.current.length === TAPE_VISIBLE_ROWS) {
        const hasPair = Boolean(slotsRef.current[0]?.pair)
        if (hasPair === showPair) return slotsRef.current
        host.replaceChildren()
        slotsRef.current = null
      }
      const slots: RowSlot[] = []
      for (let i = 0; i < TAPE_VISIBLE_ROWS; i++) {
        const root = document.createElement('div')
        root.className = 'tape-row'
        root.dataset.slot = String(i)

        let pair: HTMLSpanElement | null = null
        if (showPair) {
          pair = document.createElement('span')
          pair.className = 'col-pair mono'
          root.appendChild(pair)
        }

        const time = document.createElement('span')
        time.className = 'col-time mono'
        const side = document.createElement('span')
        side.className = 'col-side'
        const price = document.createElement('span')
        price.className = 'col-price mono'
        const qty = document.createElement('span')
        qty.className = 'col-qty mono'
        root.append(time, side, price, qty)
        host.appendChild(root)
        slots.push({ root, pair, time, side, price, qty })
      }
      slotsRef.current = slots
      return slots
    }

    const paintRows = () => {
      const showPair = showPairColumnRef.current
      const slots = ensureSlots(showPair)
      if (slots.length === 0) return
      const rows = filteredRef.current
      for (let i = 0; i < TAPE_VISIBLE_ROWS; i++) {
        const slot = slots[i]!
        const t = rows[i]
        if (!t) {
          slot.root.hidden = true
          continue
        }
        slot.root.hidden = false
        if (slot.pair) {
          slot.pair.textContent = formatPairLabel(t.symbol)
          slot.pair.title = t.symbol
        }
        slot.time.textContent = formatTime(t.eventTime)
        const buy = t.buyerIsTaker
        slot.side.textContent = buy ? 'Buy' : 'Sell'
        slot.side.className = buy ? 'col-side buy' : 'col-side sell'
        slot.price.textContent = t.price
        slot.qty.textContent = t.quantity
      }
    }

    const unregister = sharedRenderBudget.register(panelId, {
      fps: RENDER_FPS.tape,
      isVisible: () => inViewRef.current,
      paint: () => paintRows(),
    })
    sharedRenderBudget.markDirty(panelId)
    return () => {
      unregister()
      const host = rowsHostRef.current
      if (host) host.replaceChildren()
      slotsRef.current = null
    }
  }, [panelId])

  useEffect(() => {
    sharedRenderBudget.markDirty(panelId)
  }, [filteredTrades, showPairColumn, panelId])

  if (tapeSymbols.length === 0) {
    return (
      <p className="tape-empty">
        No <code>@aggTrade</code> streams.
      </p>
    )
  }

  return (
    <div
      ref={wrapRef}
      className={`tape-wrap${showPairColumn ? ' tape-wrap--multi' : ''}${
        showTapePairFilter ? ' tape-wrap--pair-filter' : ''
      }`}
    >
      <div className="tape-header">
        {showPairColumn ? (
          <div className="col-pair col-pair--header">
            <span className="tape-pair-title">Pair</span>
            {showTapePairFilter ? (
              <>
                <button
                  ref={pairFilterTriggerRef}
                  type="button"
                  className={`tape-pair-filter-trigger${
                    pairFilter !== 'all' ? ' tape-pair-filter-trigger--active' : ''
                  }`}
                  aria-label="Filter tape by pair"
                  aria-expanded={pairMenuOpen}
                  aria-haspopup="menu"
                  aria-controls={pairFilterMenuId}
                  title={
                    pairFilter === 'all'
                      ? 'Filter by pair'
                      : `Showing: ${formatPairLabel(pairFilter)}`
                  }
                  onClick={() => setPairMenuOpen((o) => !o)}
                >
                  <FilterIcon />
                </button>
                {pairMenuOpen
                  ? createPortal(
                      <div
                        ref={pairFilterPopoverRef}
                        id={pairFilterMenuId}
                        className="tape-pair-filter-popover"
                        role="menu"
                        aria-label="Tape pair filter"
                        style={{
                          position: 'fixed',
                          top: pairMenuPos.top,
                          right: pairMenuPos.right,
                          left: 'auto',
                          zIndex: 10_000,
                        }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className={`tape-pair-filter-option${
                            pairFilter === 'all'
                              ? ' tape-pair-filter-option--current'
                              : ''
                          }`}
                          onClick={() => {
                            setPairFilter('all')
                            setPairMenuOpen(false)
                          }}
                        >
                          All pairs
                        </button>
                        {selectableTapeSymbols.map((sym) => (
                          <button
                            key={sym}
                            type="button"
                            role="menuitem"
                            className={`tape-pair-filter-option${
                              pairFilter === sym
                                ? ' tape-pair-filter-option--current'
                                : ''
                            }`}
                            onClick={() => {
                              setPairFilter(sym)
                              setPairMenuOpen(false)
                            }}
                          >
                            {formatPairLabel(sym)}
                          </button>
                        ))}
                      </div>,
                      document.body,
                    )
                  : null}
              </>
            ) : null}
          </div>
        ) : null}
        <span className="col-time">Time</span>
        <span className="col-side">Side</span>
        <span className="col-price">Price</span>
        <span className="col-qty">Qty</span>
      </div>
      <div className="tape-scroll">
        {!hasTapeSelection ? (
          <p className="tape-filter-hint">
            Turn on at least one pair in <strong>Stream pairs</strong> to see
            trades.
          </p>
        ) : null}
        {hasTapeSelection &&
        pairFilter !== 'all' &&
        filteredTrades.length === 0 &&
        streamSelectedTrades.length > 0 ? (
          <p className="tape-filter-hint tape-filter-hint--subtle">
            No trades for <strong>{formatPairLabel(pairFilter)}</strong> yet.
          </p>
        ) : null}
        <div
          className="tape-inner tape-inner--budgeted"
          ref={rowsHostRef}
          hidden={!hasTapeSelection}
        />
      </div>
    </div>
  )
}
