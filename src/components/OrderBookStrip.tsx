import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useInViewport } from '../hooks/useInViewport'
import { symbolForStream } from '../lib/binance/streamSymbols'
import {
  loadStreamOrder,
  mergeStreamOrder,
  OB_DEPTH_STREAM_ORDER_KEY,
} from '../lib/obStreamOrder'
import type { PartialDepthBook } from '../lib/binance/types'
import { RENDER_FPS, sharedRenderBudget } from '../lib/render/budget'
import { OrderBook, type OrderBookStripSortableTitle } from './OrderBook'

/** Legacy single default width (used as fallback when a stream has no per-card entry). */
const STORAGE_W_LEGACY = 'trading-ui.ob-card-width-px'
/** Per depth stream id → width (px). */
const STORAGE_WIDTHS_BY_STREAM = 'trading-ui.ob-card-widths-by-stream'

const W_MIN = 220
const W_MAX = 560
const W_DEFAULT = 280

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n))
}

function loadLegacyDefaultWidth(): number {
  try {
    const raw = localStorage.getItem(STORAGE_W_LEGACY)
    if (!raw) return W_DEFAULT
    const n = Number(raw)
    return Number.isFinite(n) ? clamp(Math.round(n), W_MIN, W_MAX) : W_DEFAULT
  } catch {
    return W_DEFAULT
  }
}

function loadWidthsByStream(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_WIDTHS_BY_STREAM)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue
      out[k.toLowerCase()] = clamp(Math.round(v), W_MIN, W_MAX)
    }
    return out
  } catch {
    return {}
  }
}

function widthForStream(
  streamId: string,
  overrides: Record<string, number>,
  fallbackDefault: number,
): number {
  const key = streamId.toLowerCase()
  const o = overrides[key]
  if (typeof o === 'number' && Number.isFinite(o)) return clamp(o, W_MIN, W_MAX)
  return clamp(fallbackDefault, W_MIN, W_MAX)
}

function OrderBookCardCell(props: {
  streamId: string
  cellWidthPx: number
  depth: PartialDepthBook | null
  isPrimary: boolean
  onResizeStreamWidth: (streamId: string, nextWidth: number) => void
  stripSortableTitle?: OrderBookStripSortableTitle
}) {
  const {
    streamId,
    cellWidthPx,
    depth,
    isPrimary,
    onResizeStreamWidth,
    stripSortableTitle,
  } = props
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)
  const cellRef = useRef<HTMLDivElement>(null)
  const reactId = useId()
  const panelId = `ladder:${streamId}:${reactId}`
  const [displayDepth, setDisplayDepth] = useState(depth)
  const depthRef = useRef(depth)
  depthRef.current = depth
  const inView = useInViewport(cellRef)
  const inViewRef = useRef(inView)
  inViewRef.current = inView

  useEffect(() => {
    const unregister = sharedRenderBudget.register(panelId, {
      fps: RENDER_FPS.ladder,
      isVisible: () => inViewRef.current,
      paint: () => setDisplayDepth(depthRef.current),
    })
    sharedRenderBudget.markDirty(panelId)
    return unregister
  }, [panelId])

  useEffect(() => {
    sharedRenderBudget.markDirty(panelId)
  }, [depth, panelId])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { startX: e.clientX, startW: cellWidthPx }
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d) return
    const next = clamp(
      d.startW + (e.clientX - d.startX),
      W_MIN,
      W_MAX,
    )
    onResizeStreamWidth(streamId, next)
  }

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
  }

  return (
    <div className="ob-strip-cell-inner" ref={cellRef}>
      <OrderBook
        streamTitle={streamId}
        depth={displayDepth}
        isPrimary={isPrimary}
        stripSortableTitle={stripSortableTitle}
      />
      <div
        className="ob-strip-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize width for ${streamId}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
    </div>
  )
}

function SortableOrderBookRow(props: {
  streamId: string
  bookWidthPx: number
  depth: PartialDepthBook | null
  isPrimary: boolean
  onResizeStreamWidth: (streamId: string, nextWidth: number) => void
}) {
  const { streamId, bookWidthPx, depth, isPrimary, onResizeStreamWidth } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: streamId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    flex: '0 0 auto' as const,
    width: bookWidthPx + 12,
    boxSizing: 'border-box' as const,
    paddingRight: 12,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`ob-strip-sortable-row${isPrimary ? ' ob-strip-sortable-row--primary' : ''}${isDragging ? ' ob-strip-sortable-row--dragging' : ''}`}
    >
      <div
        className="ob-strip-sortable-book"
        style={{ width: bookWidthPx, minWidth: bookWidthPx }}
      >
        <OrderBookCardCell
          streamId={streamId}
          cellWidthPx={bookWidthPx}
          depth={depth}
          isPrimary={isPrimary}
          onResizeStreamWidth={onResizeStreamWidth}
          stripSortableTitle={{
            ref: setActivatorNodeRef,
            attributes,
            listeners,
          }}
        />
      </div>
    </div>
  )
}

export function OrderBookStrip(props: {
  depthStreamIds: string[]
  partialDepthByStream: Record<string, PartialDepthBook>
  /** Header quote symbol, e.g. BTCUSDT — highlights matching depth card. */
  primarySymbol: string
}) {
  const { depthStreamIds, partialDepthByStream, primarySymbol } = props
  const scrollRef = useRef<HTMLDivElement>(null)

  const streamsKey = useMemo(() => depthStreamIds.join('\0'), [depthStreamIds])

  const [fallbackDefaultWidth] = useState(loadLegacyDefaultWidth)
  const [widthsByStream, setWidthsByStream] = useState(loadWidthsByStream)

  const [orderedStreamIds, setOrderedStreamIds] = useState(() =>
    mergeStreamOrder(loadStreamOrder(), depthStreamIds),
  )

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync order when subscribed depth streams change
    setOrderedStreamIds((prev) => mergeStreamOrder(prev, depthStreamIds))
  }, [streamsKey, depthStreamIds])

  useEffect(() => {
    if (orderedStreamIds.length === 0) return
    localStorage.setItem(
      OB_DEPTH_STREAM_ORDER_KEY,
      JSON.stringify(orderedStreamIds),
    )
  }, [orderedStreamIds])

  useEffect(() => {
    localStorage.setItem(
      STORAGE_WIDTHS_BY_STREAM,
      JSON.stringify(widthsByStream),
    )
  }, [widthsByStream])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const a = String(active.id)
    const b = String(over.id)
    setOrderedStreamIds((items) => {
      const oldIndex = items.indexOf(a)
      const newIndex = items.indexOf(b)
      if (oldIndex < 0 || newIndex < 0) return items
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  const onResizeStreamWidth = useCallback((streamId: string, nextWidth: number) => {
    const key = streamId.toLowerCase()
    const w = clamp(Math.round(nextWidth), W_MIN, W_MAX)
    setWidthsByStream((prev) => {
      if (prev[key] === w) return prev
      return { ...prev, [key]: w }
    })
  }, [])

  if (depthStreamIds.length === 0) {
    return (
      <p className="ob-strip-empty">
        No order books match the selected pairs. Turn on pairs in{' '}
        <strong>Stream pairs</strong> that have <code>@depth</code> streams.
      </p>
    )
  }

  return (
    <div className="ob-strip-stack">
      <div ref={scrollRef} className="ob-strip-scroll">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={orderedStreamIds}
            strategy={horizontalListSortingStrategy}
          >
            <div className="ob-strip-track ob-strip-track--sortable">
              {orderedStreamIds.map((streamId) => {
                const bookW = widthForStream(
                  streamId,
                  widthsByStream,
                  fallbackDefaultWidth,
                )
                const isPrimary = symbolForStream(streamId) === primarySymbol
                return (
                  <SortableOrderBookRow
                    key={streamId}
                    streamId={streamId}
                    bookWidthPx={bookW}
                    depth={partialDepthByStream[streamId] ?? null}
                    isPrimary={isPrimary}
                    onResizeStreamWidth={onResizeStreamWidth}
                  />
                )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </div>
    </div>
  )
}
