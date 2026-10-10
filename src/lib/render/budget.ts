export type RenderBudgetRegisterOpts = {
  fps: number
  /** Invoked when dirty and the fps slot has elapsed (and isVisible !== false). */
  paint: (now: number) => void
  /** When provided and returns false, skip paint but keep the dirty flag. */
  isVisible?: () => boolean
}

export type RenderBudgetDeps = {
  requestAnimationFrame: (cb: FrameRequestCallback) => number
  cancelAnimationFrame: (id: number) => void
  now: () => number
}

type PanelSlot = {
  fps: number
  intervalMs: number
  paint: (now: number) => void
  isVisible?: () => boolean
  dirty: boolean
  /** Timestamp of last paint; null = never painted (interval gate waived for the first paint). */
  lastPaint: number | null
}

export type RenderBudget = {
  register: (id: string, opts: RenderBudgetRegisterOpts) => () => void
  markDirty: (id: string) => void
  /** Paints completed in the rolling last-second window. */
  get paintedLastSecond(): number
  /** Test / manual driver: run one budget tick at `now`. */
  tick: (now: number) => void
  /** Stop the shared rAF loop (panels stay registered). */
  stop: () => void
  /** Clear all panels and stop the loop (tests). */
  reset: () => void
}

const DEFAULT_DEPS: RenderBudgetDeps = {
  requestAnimationFrame: (cb) => requestAnimationFrame(cb),
  cancelAnimationFrame: (id) => cancelAnimationFrame(id),
  now: () => performance.now(),
}

/**
 * Shared rAF paint scheduler: data arrival only sets dirty; a panel paints when
 * dirty ∧ (now − lastPaint ≥ 1000/fps) ∧ visible.
 */
export function createRenderBudget(deps: Partial<RenderBudgetDeps> = {}): RenderBudget {
  const raf = deps.requestAnimationFrame ?? DEFAULT_DEPS.requestAnimationFrame
  const caf = deps.cancelAnimationFrame ?? DEFAULT_DEPS.cancelAnimationFrame
  const nowFn = deps.now ?? DEFAULT_DEPS.now

  const panels = new Map<string, PanelSlot>()
  let rafId: number | null = null
  let looping = false
  const paintTimestamps: number[] = []
  let paintedLastSecond = 0

  const prunePaintWindow = (now: number) => {
    const cutoff = now - 1000
    while (paintTimestamps.length > 0 && paintTimestamps[0]! < cutoff) {
      paintTimestamps.shift()
    }
    paintedLastSecond = paintTimestamps.length
  }

  const tick = (now: number) => {
    prunePaintWindow(now)
    for (const slot of panels.values()) {
      if (!slot.dirty) continue
      if (slot.isVisible && !slot.isVisible()) continue
      if (slot.lastPaint !== null && now - slot.lastPaint < slot.intervalMs) continue
      slot.dirty = false
      slot.lastPaint = now
      slot.paint(now)
      paintTimestamps.push(now)
    }
    prunePaintWindow(now)
  }

  const loop = (now: number) => {
    rafId = null
    tick(now)
    if (looping && panels.size > 0) {
      rafId = raf(loop)
    } else {
      looping = false
    }
  }

  const ensureLoop = () => {
    if (looping) return
    if (panels.size === 0) return
    looping = true
    rafId = raf(loop)
  }

  const register = (id: string, opts: RenderBudgetRegisterOpts): (() => void) => {
    const fps = Math.max(0.1, opts.fps)
    panels.set(id, {
      fps,
      intervalMs: 1000 / fps,
      paint: opts.paint,
      isVisible: opts.isVisible,
      dirty: false,
      lastPaint: null,
    })
    ensureLoop()
    return () => {
      panels.delete(id)
      if (panels.size === 0) {
        looping = false
        if (rafId !== null) {
          caf(rafId)
          rafId = null
        }
      }
    }
  }

  const markDirty = (id: string) => {
    const slot = panels.get(id)
    if (!slot) return
    slot.dirty = true
    ensureLoop()
  }

  const stop = () => {
    looping = false
    if (rafId !== null) {
      caf(rafId)
      rafId = null
    }
  }

  const reset = () => {
    stop()
    panels.clear()
    paintTimestamps.length = 0
    paintedLastSecond = 0
  }

  return {
    register,
    markDirty,
    get paintedLastSecond() {
      prunePaintWindow(nowFn())
      return paintedLastSecond
    },
    tick,
    stop,
    reset,
  }
}

/** Process-wide budget used by chart / tape / ladder panels. */
export const sharedRenderBudget = createRenderBudget()

export const RENDER_FPS = {
  kline: 5,
  ladder: 10,
  tape: 5,
  bookstrip: 10,
} as const
