import { useCallback, useId, useMemo, useState, type KeyboardEvent } from 'react'
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import type { CandlestickData } from 'lightweight-charts'
import { formatPairDisplay } from '../lib/binance/streamSymbols'
import { CandleChart } from './CandleChart'

const STORAGE_KEY = 'trading-ui.chart-pair-symbol'

type Props = {
  candlesBySymbol: Readonly<Record<string, CandlestickData[]>>
  /** Uppercase symbols with kline streams, sorted. */
  klineSymbols: readonly string[]
  primarySymbol: string
  sortableTitleHandle: {
    ref: (element: HTMLElement | null) => void
    attributes: DraggableAttributes
    listeners: DraggableSyntheticListeners | undefined
  }
}

function pickInitialSymbol(
  klineSymbols: readonly string[],
  primarySymbol: string,
): string {
  if (klineSymbols.length === 0) return primarySymbol
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && klineSymbols.includes(raw)) return raw
  } catch {
    // ignore
  }
  return klineSymbols.includes(primarySymbol)
    ? primarySymbol
    : (klineSymbols[0] ?? primarySymbol)
}

export function KlineChartPanel(props: Props) {
  const {
    candlesBySymbol,
    klineSymbols,
    primarySymbol,
    sortableTitleHandle,
  } = props
  const baseId = useId()
  const panelDomId = `${baseId}-kline-panel`

  /** User tab choice. If it leaves `klineSymbols`, it is ignored until valid again (no stale UI). */
  const [userSelected, setUserSelected] = useState<string | null>(null)

  const chartSymbol = useMemo(() => {
    if (klineSymbols.length === 0) return primarySymbol
    if (userSelected && klineSymbols.includes(userSelected)) {
      return userSelected
    }
    return pickInitialSymbol(klineSymbols, primarySymbol)
  }, [klineSymbols, primarySymbol, userSelected])

  const onSelectPair = useCallback((sym: string) => {
    setUserSelected(sym)
    try {
      localStorage.setItem(STORAGE_KEY, sym)
    } catch {
      // ignore
    }
  }, [])

  const onTabListKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (klineSymbols.length <= 1) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      e.preventDefault()
      const idx = klineSymbols.indexOf(chartSymbol)
      if (idx < 0) return
      const delta = e.key === 'ArrowRight' ? 1 : -1
      const nextIdx = Math.max(
        0,
        Math.min(klineSymbols.length - 1, idx + delta),
      )
      const nextSym = klineSymbols[nextIdx]
      if (nextSym && nextSym !== chartSymbol) {
        onSelectPair(nextSym)
        queueMicrotask(() => {
          document.getElementById(`${baseId}-tab-${nextSym}`)?.focus()
        })
      }
    },
    [baseId, chartSymbol, klineSymbols, onSelectPair],
  )

  const candles = candlesBySymbol[chartSymbol] ?? []
  const title = `${chartSymbol} · 1m`
  const multi = klineSymbols.length > 1

  return (
    <div
      className={`kline-chart-panel${multi ? ' kline-chart-panel--multi' : ''}`}
    >
      {multi ? (
        <div
          className="kline-pair-tabs"
          role="tablist"
          aria-label="Candle chart pair"
          onKeyDown={onTabListKeyDown}
        >
          {klineSymbols.map((sym) => {
            const selected = sym === chartSymbol
            return (
              <button
                key={sym}
                type="button"
                role="tab"
                id={`${baseId}-tab-${sym}`}
                aria-selected={selected}
                aria-controls={panelDomId}
                tabIndex={selected ? 0 : -1}
                className={`kline-pair-tab${selected ? ' kline-pair-tab--active' : ''}`}
                onClick={() => onSelectPair(sym)}
              >
                {formatPairDisplay(sym)}
              </button>
            )
          })}
        </div>
      ) : null}
      <div
        id={panelDomId}
        role={multi ? 'tabpanel' : undefined}
        aria-labelledby={multi ? `${baseId}-tab-${chartSymbol}` : undefined}
        aria-label={multi ? undefined : 'Candle chart'}
        className="kline-chart-panel-chart"
      >
        <CandleChart
          key={chartSymbol}
          candles={candles}
          title={title}
          sortableTitleHandle={sortableTitleHandle}
        />
      </div>
    </div>
  )
}
