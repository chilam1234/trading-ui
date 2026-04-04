import { useEffect, useRef } from 'react'
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type ISeriesApi,
  type IChartApi,
} from 'lightweight-charts'

type Props = {
  candles: CandlestickData[]
  title: string
  /** When set, the title row is the sortable drag activator (no separate panel header). */
  sortableTitleHandle?: {
    ref: (element: HTMLElement | null) => void
    attributes: DraggableAttributes
    listeners: DraggableSyntheticListeners | undefined
  }
}

export function CandleChart({ candles, title, sortableTitleHandle }: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const didFitRef = useRef(false)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: '#12141a' },
        textColor: '#9ca3af',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#2e303a' },
        horzLines: { color: '#2e303a' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#2e303a',
      },
      rightPriceScale: {
        borderColor: '#2e303a',
        scaleMargins: { top: 0.08, bottom: 0.2 },
      },
      crosshair: {
        vertLine: { color: '#6b7280', width: 1 as const, style: 2 },
        horzLine: { color: '#6b7280', width: 1 as const, style: 2 },
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#34d399',
      downColor: '#f87171',
      borderVisible: false,
      wickUpColor: '#34d399',
      wickDownColor: '#f87171',
    })

    chartRef.current = chart
    seriesRef.current = series

    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect
      if (!cr || !chartRef.current) return
      chart.resize(
        Math.floor(cr.width),
        Math.floor(cr.height),
      )
    })
    ro.observe(el)

    return () => {
      ro.disconnect()
      seriesRef.current = null
      chartRef.current = null
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const series = seriesRef.current
    const chart = chartRef.current
    if (!series) return
    series.setData(candles)
    if (candles.length > 0 && chart && !didFitRef.current) {
      chart.timeScale().fitContent()
      didFitRef.current = true
    }
  }, [candles])

  return (
    <div
      className={`chart-wrap${sortableTitleHandle ? ' chart-wrap--sortable-root' : ''}`}
    >
      <div
        ref={sortableTitleHandle?.ref}
        className={`chart-title${sortableTitleHandle ? ' chart-title--drag-handle' : ''}`}
        {...sortableTitleHandle?.attributes}
        {...sortableTitleHandle?.listeners}
        aria-label={
          sortableTitleHandle ? 'Drag to reorder: Chart' : undefined
        }
      >
        {title}
      </div>
      <div ref={hostRef} className="chart-host" />
    </div>
  )
}
