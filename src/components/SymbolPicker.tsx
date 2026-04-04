import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatPairLabel } from '../lib/binance/formatPairLabel'
import { fetchUsdtTradingSymbols } from '../lib/binance/exchangeInfo'

export const DEFAULT_MAX_EXTRA = 24

type Props = {
  primaryLower: string
  extraSymbols: string[]
  onExtraSymbolsChange: (next: string[]) => void
  maxExtra?: number
}

export function SymbolPicker(props: Props) {
  const {
    primaryLower,
    extraSymbols,
    onExtraSymbolsChange,
    maxExtra = DEFAULT_MAX_EXTRA,
  } = props

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [allSymbols, setAllSymbols] = useState<string[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || allSymbols !== null) return
    let cancelled = false
    fetchUsdtTradingSymbols()
      .then((list) => {
        if (!cancelled) {
          setAllSymbols(list)
          setLoadError(null)
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : 'Failed to load symbols')
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, allSymbols])

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      const el = rootRef.current
      if (el && !el.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const extraSet = useMemo(
    () => new Set(extraSymbols.map((s) => s.toLowerCase())),
    [extraSymbols],
  )

  const filtered = useMemo(() => {
    if (!allSymbols) return []
    const q = query.trim().toLowerCase()
    if (!q) return allSymbols
    return allSymbols.filter(
      (s) => s.includes(q) || formatPairLabel(s).toLowerCase().includes(q),
    )
  }, [allSymbols, query])

  const toggleSymbol = useCallback(
    (sym: string) => {
      const s = sym.toLowerCase()
      if (s === primaryLower) return
      const next = new Set(extraSymbols.map((x) => x.toLowerCase()))
      if (next.has(s)) {
        next.delete(s)
      } else {
        if (next.size >= maxExtra) return
        next.add(s)
      }
      onExtraSymbolsChange([...next].sort())
    },
    [extraSymbols, onExtraSymbolsChange, primaryLower, maxExtra],
  )

  const removeExtra = useCallback(
    (sym: string) => {
      const s = sym.toLowerCase()
      onExtraSymbolsChange(
        extraSymbols.filter((x) => x.toLowerCase() !== s),
      )
    },
    [extraSymbols, onExtraSymbolsChange],
  )

  return (
    <div ref={rootRef} className="symbol-picker">
      <button
        type="button"
        className="symbol-picker-trigger"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Markets
        <span className="symbol-picker-count mono">
          +{extraSymbols.length}
        </span>
      </button>
      {extraSymbols.length > 0 ? (
        <div className="symbol-picker-chips" aria-label="Extra markets">
          {extraSymbols.map((s) => (
            <button
              key={s}
              type="button"
              className="symbol-picker-chip"
              onClick={() => removeExtra(s)}
              title={`Remove ${s}`}
            >
              <span className="mono">{formatPairLabel(s)}</span>
              <span className="symbol-picker-chip-x" aria-hidden>
                ×
              </span>
            </button>
          ))}
        </div>
      ) : null}
      {open ? (
        <div className="symbol-picker-popover" role="dialog" aria-label="Add markets">
          <p className="symbol-picker-hint">
            USDT pairs from <code>exchangeInfo</code>. Primary{' '}
            <strong className="mono">{formatPairLabel(primaryLower)}</strong> is
            always on. Max {maxExtra} extra.
          </p>
          <input
            type="search"
            className="symbol-picker-search"
            placeholder="Search symbol…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {open && allSymbols === null && !loadError ? (
            <p className="symbol-picker-status">Loading symbols…</p>
          ) : null}
          {loadError ? (
            <p className="symbol-picker-error">{loadError}</p>
          ) : null}
          {allSymbols ? (
            <ul className="symbol-picker-list" role="listbox">
              {filtered.slice(0, 400).map((sym) => {
                if (sym === primaryLower) return null
                const on = extraSet.has(sym)
                const atCap = !on && extraSet.size >= maxExtra
                return (
                  <li key={sym} role="option" aria-selected={on}>
                    <button
                      type="button"
                      className={`symbol-picker-row ${on ? 'symbol-picker-row--on' : ''}`}
                      disabled={atCap}
                      onClick={() => toggleSymbol(sym)}
                    >
                      <span className="symbol-picker-row-label mono">
                        {formatPairLabel(sym)}
                      </span>
                      <span className="symbol-picker-row-raw mono">{sym}</span>
                      {on ? (
                        <span className="symbol-picker-row-badge">On</span>
                      ) : atCap ? (
                        <span className="symbol-picker-row-badge">Max</span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {allSymbols && filtered.length > 400 ? (
            <p className="symbol-picker-more">Refine search — showing 400 matches.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
