import { useState } from 'react'
import { useFrameTimeSampler } from '../hooks/useFrameTimeSampler'
import { useLongTaskObserver } from '../hooks/useLongTaskObserver'
import type {
  BackendHealth,
  IngestFlushMetrics,
  MarketStats,
} from '../hooks/useBinanceMarket'

type Props = {
  stats: MarketStats
  ingest: IngestFlushMetrics
  backendHealth?: BackendHealth | null
}

export function DevPerfHud(props: Props) {
  const { stats, ingest, backendHealth = null } = props
  const [perfHudOpen, setPerfHudOpen] = useState(true)
  const frames = useFrameTimeSampler(true)
  const longTasks = useLongTaskObserver(true)

  const staleSorted =
    backendHealth && backendHealth.staleStreams.length > 0
      ? [...backendHealth.staleStreams].sort(
          (a, b) => b.staleForMs - a.staleForMs,
        )
      : []
  const stalePreview = staleSorted.slice(0, 6)
  const staleMore = staleSorted.length - stalePreview.length

  const coalesceHint =
    ingest.lastWsMsgsInFlush > 1
      ? `${ingest.lastWsMsgsInFlush} WS msgs → 1 rAF flush`
      : ingest.lastWsMsgsInFlush === 1
        ? '1 WS msg / flush'
        : 'idle'

  return (
    <aside
      className="dev-perf-hud-aside"
      aria-label="Development performance HUD"
    >
      <details
        className="dev-perf-hud"
        open={perfHudOpen}
        onToggle={(e) => setPerfHudOpen(e.currentTarget.open)}
      >
        <summary className="dev-perf-hud-summary">Dev perf</summary>
        <div className="dev-perf-hud-body">
          <dl className="dev-perf-hud-dl">
            <dt>Frame Δ p50</dt>
            <dd>{frames.p50Ms.toFixed(2)} ms</dd>
            <dt>Frame Δ p95</dt>
            <dd>{frames.p95Ms.toFixed(2)} ms</dd>
            <dt>Frame samples</dt>
            <dd>{frames.sampleCount}</dd>
            <dt>Long tasks (10s)</dt>
            <dd>
              {longTasks.supported
                ? `${longTasks.countInWindow} (last ${longTasks.lastDurationMs} ms)`
                : 'n/a'}
            </dd>
            <dt>WS msgs/s</dt>
            <dd>{stats.msgsPerSec}</dd>
            <dt>rAF flushes/s</dt>
            <dd>{stats.flushesPerSec}</dd>
            <dt>Last flush</dt>
            <dd className="dev-perf-hud-mono">{coalesceHint}</dd>
            <dt>Trades buffered</dt>
            <dd>{ingest.lastTradeBufferLen}</dd>
            <dt>EMA WS / flush</dt>
            <dd>{ingest.emaWsMsgsPerFlush.toFixed(1)}</dd>
            <dt>Worker batches/s</dt>
            <dd>{ingest.workerBatchesPerSec}</dd>
            <dt>Worker parsed/s</dt>
            <dd>{ingest.workerParsedPerSec}</dd>
            <dt>Fallback parsed/s</dt>
            <dd>{ingest.fallbackParsedPerSec}</dd>
            <dt>First depth pending</dt>
            <dd>{ingest.firstDepthPending}</dd>
            <dt>Pairs served/flush</dt>
            <dd>{ingest.pairsServedPerFlush}</dd>
            <dt>Depth backlog</dt>
            <dd>{ingest.depthBacklog}</dd>
            {backendHealth ? (
              <>
                <dt>Upstream msgs/s</dt>
                <dd>{backendHealth.upstreamMsgsPerSec}</dd>
                <dt>Stale streams</dt>
                <dd className="dev-perf-hud-stale-dd">
                  <div className="dev-perf-hud-stale-count">
                    {backendHealth.staleStreams.length}
                  </div>
                  {stalePreview.length > 0 ? (
                    <ul className="dev-perf-hud-stale-list">
                      {stalePreview.map((s) => (
                        <li key={s.stream}>
                          {s.stream}{' '}
                          <span className="dev-perf-hud-muted">
                            ({Math.round(s.staleForMs)} ms)
                          </span>
                        </li>
                      ))}
                      {staleMore > 0 ? (
                        <li className="dev-perf-hud-muted">+{staleMore} more</li>
                      ) : null}
                    </ul>
                  ) : null}
                </dd>
                <dt>Fanout clients</dt>
                <dd>{backendHealth.clientCount}</dd>
              </>
            ) : null}
          </dl>
        </div>
      </details>
    </aside>
  )
}
