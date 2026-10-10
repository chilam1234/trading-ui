import type { ReactNode } from 'react'
import { formatPairLabel } from '../lib/binance/formatPairLabel'

/** One pair: Pulse block + session / 24h row inside a tall card. */
export function PairDeskCard(props: {
  symbolUpper: string
  children: ReactNode
}) {
  const label = formatPairLabel(props.symbolUpper)
  return (
    <article
      className="pair-desk-card"
      aria-label={`Metrics for ${label}`}
    >
      <div className="pair-desk-scroll">
        <div className="pair-desk-track">{props.children}</div>
      </div>
    </article>
  )
}
