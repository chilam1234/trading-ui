import { memo, useMemo } from 'react'
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from '@dnd-kit/core'
import {
  formatPairDisplay,
  streamKindSuffix,
  symbolForStream,
} from '../lib/binance/streamSymbols'
import { partialDepthContentKey } from '../lib/binance/partialDepthContentKey'
import type { PartialDepthBook } from '../lib/binance/types'

export type OrderBookStripSortableTitle = {
  ref: (element: HTMLElement | null) => void
  attributes: DraggableAttributes
  listeners: DraggableSyntheticListeners | undefined
}

function parseQty(s: string | undefined): number {
  if (!s) return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : 0
}

function maxQty(levels: { quantity: string }[]): number {
  let m = 0
  for (const l of levels) {
    const q = parseQty(l.quantity)
    if (q > m) m = q
  }
  return m
}

function QtyBarCell(props: {
  qty: string | undefined
  maxQty: number
  side: 'bid' | 'ask'
}) {
  const { qty, maxQty, side } = props
  const q = parseQty(qty)
  const denom = maxQty > 0 ? maxQty : 1
  const pct = Math.min(100, (q / denom) * 100)

  if (!qty) {
    return <span className={`ob-qty-cell ob-qty-cell--${side}`} />
  }

  return (
    <span className={`ob-qty-cell ob-qty-cell--${side}`}>
      <span
        className={`ob-qty-bar ob-qty-bar--${side}`}
        style={{ width: `${pct}%` }}
        aria-hidden
      />
      <span className="ob-qty-text mono">{qty}</span>
    </span>
  )
}

function stripSortableTitleEqual(
  a: OrderBookStripSortableTitle | undefined,
  b: OrderBookStripSortableTitle | undefined,
) {
  if (a === b) return true
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.ref === b.ref &&
    a.attributes === b.attributes &&
    a.listeners === b.listeners
  )
}

function OrderBookInner(props: {
  depth: PartialDepthBook | null
  /** Multiplex stream id, e.g. `btcusdt@depth10@100ms`. */
  streamTitle?: string
  /** Matches session primary symbol for highlight on this card. */
  isPrimary?: boolean
  /** When set, the title row is the horizontal strip drag activator. */
  stripSortableTitle?: OrderBookStripSortableTitle
}) {
  const { depth, streamTitle, isPrimary, stripSortableTitle } = props
  const { pairLabel, suffix, fullTitle } = useMemo(() => {
    if (!streamTitle) {
      return {
        pairLabel: 'Order book',
        suffix: null as string | null,
        fullTitle: 'Order book',
      }
    }
    const sym = symbolForStream(streamTitle)
    return {
      pairLabel: formatPairDisplay(sym),
      suffix: streamKindSuffix(streamTitle),
      fullTitle: streamTitle,
    }
  }, [streamTitle])

  const { maxBidQty, maxAskQty } = useMemo(() => {
    if (!depth) {
      return { maxBidQty: 1, maxAskQty: 1 }
    }
    return {
      maxBidQty: Math.max(maxQty(depth.bids), 1),
      maxAskQty: Math.max(maxQty(depth.asks), 1),
    }
  }, [depth])

  const wrapClass = `ob-wrap${isPrimary ? ' ob-wrap--primary' : ''}`

  if (!depth) {
    return (
      <div className={wrapClass}>
        <div
          ref={stripSortableTitle?.ref}
          className={`ob-title${stripSortableTitle ? ' ob-title--strip-drag' : ''}`}
          {...stripSortableTitle?.attributes}
          {...stripSortableTitle?.listeners}
          aria-label={
            stripSortableTitle && streamTitle
              ? `Drag to reorder ${streamTitle}`
              : stripSortableTitle
                ? 'Drag to reorder'
                : undefined
          }
        >
          <div className="ob-title-pair">
            <span className="ob-pair-display">{pairLabel}</span>
            {suffix ? (
              <span className="ob-stream-suffix mono" title={fullTitle}>
                {suffix}
              </span>
            ) : null}
          </div>
        </div>
        <p className="ob-placeholder">Waiting for depth snapshot…</p>
      </div>
    )
  }

  const maxRows = Math.max(depth.bids.length, depth.asks.length)

  return (
    <div className={wrapClass}>
      <div
        ref={stripSortableTitle?.ref}
        className={`ob-title${stripSortableTitle ? ' ob-title--strip-drag' : ''}`}
        {...stripSortableTitle?.attributes}
        {...stripSortableTitle?.listeners}
        aria-label={
          stripSortableTitle && streamTitle
            ? `Drag to reorder ${streamTitle}`
            : stripSortableTitle
              ? 'Drag to reorder'
              : undefined
        }
      >
        <div className="ob-title-pair">
          <span className="ob-pair-display" title={fullTitle}>
            {pairLabel}
          </span>
          {suffix ? (
            <span className="ob-stream-suffix mono" title={fullTitle}>
              {suffix}
            </span>
          ) : null}
        </div>
        <span className="ob-meta mono">
          u {depth.lastUpdateIdStr ?? String(depth.lastUpdateId)}
        </span>
      </div>
      <div className="ob-header">
        <span className="ob-h-bid">Bid</span>
        <span className="ob-h-ask">Ask</span>
      </div>
      <div className="ob-header ob-sub">
        <span>Qty</span>
        <span>Price</span>
        <span>Price</span>
        <span>Qty</span>
      </div>
      <div className="ob-rows">
        {Array.from({ length: maxRows }, (_, i) => {
          const bid = depth.bids[i]
          const ask = depth.asks[i]
          return (
            <div className="ob-row" key={i}>
              <QtyBarCell qty={bid?.quantity} maxQty={maxBidQty} side="bid" />
              <span className="mono ob-price bid">{bid?.price ?? ''}</span>
              <span className="mono ob-price ask">{ask?.price ?? ''}</span>
              <QtyBarCell qty={ask?.quantity} maxQty={maxAskQty} side="ask" />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function orderBookPropsEqual(
  a: {
    depth: PartialDepthBook | null
    streamTitle?: string
    isPrimary?: boolean
    stripSortableTitle?: OrderBookStripSortableTitle
  },
  b: {
    depth: PartialDepthBook | null
    streamTitle?: string
    isPrimary?: boolean
    stripSortableTitle?: OrderBookStripSortableTitle
  },
): boolean {
  if (a.streamTitle !== b.streamTitle) return false
  if (Boolean(a.isPrimary) !== Boolean(b.isPrimary)) return false
  if (!stripSortableTitleEqual(a.stripSortableTitle, b.stripSortableTitle))
    return false
  if (a.depth === b.depth) return true
  if (!a.depth || !b.depth) return !a.depth && !b.depth
  return partialDepthContentKey(a.depth) === partialDepthContentKey(b.depth)
}

export const OrderBook = memo(OrderBookInner, orderBookPropsEqual)
