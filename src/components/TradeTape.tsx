import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { NormalizedTrade } from '../lib/binance/types'
import { formatPairLabel } from '../lib/binance/formatPairLabel'

const ROW_H = 34

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

/**
 * Single virtualized tape. Pair visibility is controlled by `selectedPairs`
 * (Stream pairs menu). Only trades whose `symbol` is selected are shown.
 */
export function TradeTape(props: {
  trades: NormalizedTrade[]
  /** Symbols that have @aggTrade (uppercase). */
  tapeSymbols: readonly string[]
  /** Subset of pairs to show (from Stream pairs menu). */
  selectedPairs: ReadonlySet<string>
}) {
  const { trades, tapeSymbols, selectedPairs } = props
  const parentRef = useRef<HTMLDivElement>(null)

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

  /** Keep Pair tags whenever multiple @aggTrade feeds exist, even if Stream pairs filter shows one market. */
  const showPairColumn = tapeSymbols.length > 1

  const showTapePairFilter = selectableTapeSymbols.length > 1

  const hasTapeSelection = useMemo(() => {
    for (const s of tapeSymbols) {
      if (selectedPairs.has(s.toUpperCase())) return true
    }
    return false
  }, [tapeSymbols, selectedPairs])

  /* eslint-disable react-hooks/incompatible-library -- TanStack Virtual */
  const virtualizer = useVirtualizer({
    count: filteredTrades.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_H,
    overscan: 16,
    getItemKey: (index) => filteredTrades[index]?.ingestSeq ?? index,
    useFlushSync: false,
  })
  /* eslint-enable react-hooks/incompatible-library */

  if (tapeSymbols.length === 0) {
    return (
      <p className="tape-empty">
        No <code>@aggTrade</code> streams.
      </p>
    )
  }

  return (
    <div
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
      <div className="tape-scroll" ref={parentRef}>
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
          className="tape-inner"
          style={{
            height:
              !hasTapeSelection || filteredTrades.length === 0
                ? 0
                : `${virtualizer.getTotalSize()}px`,
          }}
        >
          {hasTapeSelection && filteredTrades.length > 0
            ? virtualizer.getVirtualItems().map((vi) => {
                const t = filteredTrades[vi.index]
                if (!t) return null
                const buy = t.buyerIsTaker
                return (
                  <div
                    key={t.ingestSeq}
                    className="tape-row"
                    style={{
                      height: `${vi.size}px`,
                      transform: `translateY(${vi.start}px)`,
                    }}
                  >
                    {showPairColumn ? (
                      <span className="col-pair mono" title={t.symbol}>
                        {formatPairLabel(t.symbol)}
                      </span>
                    ) : null}
                    <span className="col-time mono">
                      {formatTime(t.eventTime)}
                    </span>
                    <span className={buy ? 'col-side buy' : 'col-side sell'}>
                      {buy ? 'Buy' : 'Sell'}
                    </span>
                    <span className="col-price mono">{t.price}</span>
                    <span className="col-qty mono">{t.quantity}</span>
                  </div>
                )
              })
            : null}
        </div>
      </div>
    </div>
  )
}
