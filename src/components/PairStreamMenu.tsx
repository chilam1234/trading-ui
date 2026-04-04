import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatPairLabel } from '../lib/binance/formatPairLabel'

const LIST_CAP = 500

export function PairStreamMenu(props: {
  /** Full USDT list from exchangeInfo (or fallback while loading). */
  catalogSymbols: readonly string[]
  /** Symbols actually present on the WebSocket (subscribed). */
  subscribedSymbols: readonly string[]
  selectedPairs: ReadonlySet<string>
  onToggle: (symbol: string) => void
  onSelectAll: () => void
  onClearAll: () => void
  catalogError?: string | null
  catalogLoading?: boolean
  /** Subscribe this pair by adding it as an extra market (same as Markets). */
  onAddMarketPair?: (symbolLower: string) => void
  /** When 0, add-to-markets rows are disabled (extra cap). */
  marketSlotsRemaining?: number
}) {
  const {
    catalogSymbols,
    subscribedSymbols,
    selectedPairs,
    onToggle,
    onSelectAll,
    onClearAll,
    catalogError,
    catalogLoading,
    onAddMarketPair,
    marketSlotsRemaining = Number.POSITIVE_INFINITY,
  } = props

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const listId = useId()

  const subscribedSet = useMemo(
    () => new Set(subscribedSymbols.map((s) => s.toUpperCase())),
    [subscribedSymbols],
  )

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...catalogSymbols]
    return catalogSymbols.filter((sym) => {
      const label = formatPairLabel(sym).toLowerCase()
      return sym.toLowerCase().includes(q) || label.includes(q)
    })
  }, [catalogSymbols, query])

  const visibleRows = useMemo(
    () => filtered.slice(0, LIST_CAP),
    [filtered],
  )

  const selectedSubscribed = useMemo(() => {
    let n = 0
    for (const s of subscribedSymbols) {
      if (selectedPairs.has(s.toUpperCase())) n += 1
    }
    return n
  }, [subscribedSymbols, selectedPairs])

  const subscribedCount = subscribedSymbols.length

  return (
    <div ref={rootRef} className="pair-stream-menu">
      <button
        type="button"
        className="pair-stream-menu-trigger"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
      >
        Stream pairs
        <span className="pair-stream-menu-count mono" title="Visible / subscribed">
          {selectedSubscribed}/{subscribedCount}
        </span>
        <span className="pair-stream-menu-catalog mono" title="USDT pairs in catalog">
          ({catalogSymbols.length})
        </span>
      </button>
      {open ? (
        <div
          className="pair-stream-menu-popover"
          id={listId}
          role="dialog"
          aria-label="Stream pairs filter"
        >
          <p className="pair-stream-menu-intro">
            Full USDT list from <code>exchangeInfo</code>. Use{' '}
            <strong>Add</strong> on a row to subscribe it, or toggle checkboxes
            for pairs already on the socket.
          </p>
          {catalogLoading ? (
            <p className="pair-stream-menu-status">Loading catalog…</p>
          ) : null}
          {catalogError ? (
            <p className="pair-stream-menu-error">{catalogError}</p>
          ) : null}
          <input
            type="search"
            className="pair-stream-menu-search"
            placeholder="Search all USDT pairs…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="pair-stream-menu-actions">
            <button type="button" className="pair-stream-menu-link" onClick={onSelectAll}>
              Select all subscribed
            </button>
            <button type="button" className="pair-stream-menu-link" onClick={onClearAll}>
              Clear all
            </button>
          </div>
          <ul className="pair-stream-menu-list" role="listbox" aria-multiselectable>
            {visibleRows.map((sym) => {
              const u = sym.toUpperCase()
              const subscribed = subscribedSet.has(u)
              const on = selectedPairs.has(u)
              const atCap = marketSlotsRemaining <= 0
              return (
                <li key={sym} role="option" aria-selected={on && subscribed}>
                  {subscribed ? (
                    <label className="pair-stream-menu-row">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(sym)}
                      />
                      <span className="pair-stream-menu-label mono">
                        {formatPairLabel(sym)}
                      </span>
                      <span className="pair-stream-menu-raw mono">{sym}</span>
                    </label>
                  ) : (
                    <button
                      type="button"
                      className="pair-stream-menu-row pair-stream-menu-row--nosub pair-stream-menu-add"
                      disabled={!onAddMarketPair || atCap}
                      title={
                        atCap
                          ? 'Maximum extra markets reached — remove one under Markets'
                          : 'Add pair to Markets and subscribe streams'
                      }
                      aria-label={`Add ${formatPairLabel(sym)} to markets`}
                      onClick={() => {
                        onAddMarketPair?.(sym.toLowerCase())
                        setOpen(false)
                      }}
                    >
                      <span className="pair-stream-menu-fake-check" aria-hidden />
                      <span className="pair-stream-menu-label mono">
                        {formatPairLabel(sym)}
                      </span>
                      <span className="pair-stream-menu-raw mono">{sym}</span>
                      <span className="pair-stream-menu-badge">Add</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
          {filtered.length > LIST_CAP ? (
            <p className="pair-stream-menu-more">
              Showing {LIST_CAP} of {filtered.length} matches — refine search.
            </p>
          ) : null}
          {filtered.length === 0 ? (
            <p className="pair-stream-menu-empty">No matches.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
