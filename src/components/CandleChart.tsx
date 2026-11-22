import { useEffect, useId, useRef } from 'react'
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  CandlestickSeries,
  ColorType,
  createChart,
  LineSeries,
  type CandlestickData,
  type ISeriesApi,
  type IChartApi,
} from 'lightweight-charts'
import { useInViewport } from '../hooks/useInViewport'
import { smaClose } from '../lib/indicators/sma'
import { RENDER_FPS, sharedRenderBudget } from '../lib/render/budget'
import {
  candlePrefixHash,
  planCandleUpdate,
} from '../lib/render/candleUpdate'
import { DPR_CHANGED_EVENT, getCanvasDpr } from '../lib/render/canvasDpr'

const SMA_PERIOD = 20

type Props = {
  candles: CandlestickData[]
  title: string
  /** When set, the title row is the sortable drag activator (no separate panel header). */
  sortableTitleHandle?: {
    ref: (element: HTMLElement | null) => void
    attributes: DraggableAttributes
    listeners: DraggableSyntheticListeners | undefined
  }
  /** Overlay SMA(20) on closes — educational / non-advisory. */
  showSma?: boolean
}

export function CandleChart({
  candles,
  title,
  sortableTitleHandle,
  showSma = true,
}: Props) {
  const reactId = useId()
  const panelId = `kline:${reactId}`
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const smaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null)
  const didFitRef = useRef(false)
  const lastChartSigRef = useRef<string>('')
  const prevCandlesLenRef = useRef(0)
  const prevHeadHashRef = useRef(0)
  const prevFullHashRef = useRef(0)
  const prevLastTimeRef = useRef(Number.NaN)
  const prevSmaActiveRef = useRef(false)
  const pendingRef = useRef({ candles, showSma })
  pendingRef.current = { candles, showSma }
  const inView = useInViewport(wrapRef)
  const inViewRef = useRef(inView)
  inViewRef.current = inView

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

    const smaSeries = chart.addSeries(LineSeries, {
      color: '#06b6d4',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: true,
    })

    chartRef.current = chart
    seriesRef.current = series
    smaSeriesRef.current = smaSeries
    lastChartSigRef.current = ''

    const resizeToHost = () => {
      const host = hostRef.current
      if (!host || !chartRef.current) return
      // Touch capped DPR (window override) so fancy-canvas remeasures.
      void getCanvasDpr()
      chartRef.current.resize(
        Math.floor(host.clientWidth),
        Math.floor(host.clientHeight),
      )
    }

    const ro = new ResizeObserver(() => {
      resizeToHost()
    })
    ro.observe(el)
    window.addEventListener(DPR_CHANGED_EVENT, resizeToHost)

    return () => {
      window.removeEventListener(DPR_CHANGED_EVENT, resizeToHost)
      ro.disconnect()
      smaSeriesRef.current = null
      seriesRef.current = null
      chartRef.current = null
      lastChartSigRef.current = ''
      prevCandlesLenRef.current = 0
      prevHeadHashRef.current = 0
      prevFullHashRef.current = 0
      prevLastTimeRef.current = Number.NaN
      prevSmaActiveRef.current = false
      chart.remove()
    }
  }, [])

  useEffect(() => {
    const applyPaint = () => {
      const series = seriesRef.current
      const chart = chartRef.current
      const smaSeries = smaSeriesRef.current
      if (!series) return

      const { candles: nextCandles, showSma: nextShowSma } = pendingRef.current
      const fullHash = candlePrefixHash(nextCandles, nextCandles.length)
      const fullSig = `${fullHash}:${nextCandles.length}|${nextShowSma ? 1 : 0}`
      if (fullSig === lastChartSigRef.current) return
      lastChartSigRef.current = fullSig

      const prevLen = prevCandlesLenRef.current
      const last = nextCandles[nextCandles.length - 1]
      const plan = planCandleUpdate(
        {
          prevLen,
          prevHeadHash: prevHeadHashRef.current,
          prevFullHash: prevFullHashRef.current,
          prevLastTime: prevLastTimeRef.current,
        },
        nextCandles,
      )

      if (plan === 'update-last' && last !== undefined) {
        series.update(last)
      } else {
        series.setData(nextCandles)
        if (nextCandles.length === 0) {
          didFitRef.current = false
        }
        if (nextCandles.length > 0 && chart && !didFitRef.current) {
          chart.timeScale().fitContent()
          didFitRef.current = true
        }
      }

      prevCandlesLenRef.current = nextCandles.length
      prevHeadHashRef.current = candlePrefixHash(
        nextCandles,
        nextCandles.length - 1,
      )
      prevFullHashRef.current = fullHash
      prevLastTimeRef.current =
        nextCandles.length > 0 ? Number(last!.time) : Number.NaN

      if (smaSeries) {
        if (!nextShowSma || nextCandles.length < SMA_PERIOD) {
          if (prevSmaActiveRef.current) {
            smaSeries.setData([])
            prevSmaActiveRef.current = false
          }
        } else {
          smaSeries.setData(smaClose(nextCandles, SMA_PERIOD))
          prevSmaActiveRef.current = true
        }
      }
    }

    const unregister = sharedRenderBudget.register(panelId, {
      fps: RENDER_FPS.kline,
      isVisible: () => inViewRef.current,
      paint: () => applyPaint(),
    })
    sharedRenderBudget.markDirty(panelId)
    return unregister
  }, [panelId])

  useEffect(() => {
    sharedRenderBudget.markDirty(panelId)
  }, [candles, showSma, panelId])

  return (
    <div
      ref={wrapRef}
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
