import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CandlestickData } from 'lightweight-charts'
import { readHideChartFlag } from '../config/hideChart'
import type { NormalizedTrade, PartialDepthBook } from '../lib/binance/types'
import { KlineChartPanel } from './KlineChartPanel'
import { OrderBookStrip } from './OrderBookStrip'
import { TradeTape } from './TradeTape'

const STORAGE_KEY = 'trading-ui.market-panel-order'

const PANEL_IDS = ['orderbooks', 'tape', 'chart'] as const
type MarketPanelId = (typeof PANEL_IDS)[number]

function isPanelId(s: string): s is MarketPanelId {
  return (PANEL_IDS as readonly string[]).includes(s)
}

function loadOrder(): MarketPanelId[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return [...PANEL_IDS]
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return [...PANEL_IDS]
    const next: MarketPanelId[] = []
    for (const x of parsed) {
      if (typeof x === 'string' && isPanelId(x) && !next.includes(x)) {
        next.push(x)
      }
    }
    for (const id of PANEL_IDS) {
      if (!next.includes(id)) next.push(id)
    }
    return next
  } catch {
    return [...PANEL_IDS]
  }
}

type SortablePanelDragHandle = {
  setActivatorNodeRef: (node: HTMLElement | null) => void
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners | undefined
}

type SortablePanelShellProps =
  | {
      id: MarketPanelId
      label: string
      innerDragHandle?: false
      children: ReactNode
    }
  | {
      id: MarketPanelId
      label: string
      innerDragHandle: true
      children: (handle: SortablePanelDragHandle) => ReactNode
    }

function SortablePanelShell(props: SortablePanelShellProps) {
  const { id, label } = props
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const panelClass = `sortable-panel${isDragging ? ' sortable-panel--dragging' : ''}${
    props.innerDragHandle ? ' sortable-panel--inner-handle' : ''
  }`

  if (props.innerDragHandle) {
    return (
      <div ref={setNodeRef} style={style} className={panelClass}>
        {props.children({
          setActivatorNodeRef,
          attributes,
          listeners,
        })}
      </div>
    )
  }

  const { children } = props

  return (
    <div ref={setNodeRef} style={style} className={panelClass}>
      <button
        type="button"
        className="sortable-panel-header"
        aria-label={`Drag to reorder: ${label}`}
        {...attributes}
        {...listeners}
      >
        <span className="sortable-panel-grip" aria-hidden>
          ⋮⋮
        </span>
        <span className="sortable-panel-title">{label}</span>
      </button>
      <div className="sortable-panel-body">{children}</div>
    </div>
  )
}

export function SortableMarketPanels(props: {
  /** Depth stream ids filtered by selected pairs. */
  visibleDepthStreams: string[]
  partialDepthByStream: Record<string, PartialDepthBook>
  trades: NormalizedTrade[]
  tapeSymbols: string[]
  selectedPairs: ReadonlySet<string>
  primarySymbol: string
  klineSymbols: readonly string[]
  candlesBySymbol: Readonly<Record<string, CandlestickData[]>>
}) {
  const {
    visibleDepthStreams,
    partialDepthByStream,
    trades,
    tapeSymbols,
    selectedPairs,
    primarySymbol,
    klineSymbols,
    candlesBySymbol,
  } = props

  const [order, setOrder] = useState<MarketPanelId[]>(loadOrder)

  const [hideChart] = useState(readHideChartFlag)

  const panelOrder = useMemo(
    () => (hideChart ? order.filter((id) => id !== 'chart') : order),
    [hideChart, order],
  )

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(order))
  }, [order])

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
    const a = active.id as MarketPanelId
    const b = over.id as MarketPanelId
    if (!isPanelId(a) || !isPanelId(b)) return
    setOrder((items) => {
      const oldIndex = items.indexOf(a)
      const newIndex = items.indexOf(b)
      if (oldIndex < 0 || newIndex < 0) return items
      return arrayMove(items, oldIndex, newIndex)
    })
  }

  const renderPanel = (id: Exclude<MarketPanelId, 'chart'>) => {
    switch (id) {
      case 'orderbooks':
        return (
          <OrderBookStrip
            depthStreamIds={visibleDepthStreams}
            partialDepthByStream={partialDepthByStream}
            primarySymbol={primarySymbol}
          />
        )
      case 'tape':
        return (
          <TradeTape
            trades={trades}
            tapeSymbols={tapeSymbols}
            selectedPairs={selectedPairs}
          />
        )
      default:
        return null
    }
  }

  const labelFor = (id: MarketPanelId): string => {
    switch (id) {
      case 'orderbooks':
        return 'Order books'
      case 'tape':
        return 'Trade tape'
      case 'chart':
        return 'Chart'
      default:
        return id
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={[...panelOrder]} strategy={verticalListSortingStrategy}>
        <div className="market-panels">
          {panelOrder.map((panelId) =>
            panelId === 'chart' ? (
              <SortablePanelShell
                key={panelId}
                id={panelId}
                label={labelFor(panelId)}
                innerDragHandle
              >
                {(handle) => (
                  <KlineChartPanel
                    candlesBySymbol={candlesBySymbol}
                    klineSymbols={klineSymbols}
                    primarySymbol={primarySymbol}
                    sortableTitleHandle={{
                      ref: handle.setActivatorNodeRef,
                      attributes: handle.attributes,
                      listeners: handle.listeners,
                    }}
                  />
                )}
              </SortablePanelShell>
            ) : (
              <SortablePanelShell key={panelId} id={panelId} label={labelFor(panelId)}>
                {renderPanel(panelId)}
              </SortablePanelShell>
            ),
          )}
        </div>
      </SortableContext>
    </DndContext>
  )
}
