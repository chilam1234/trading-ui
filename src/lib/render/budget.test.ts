import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderBudget } from './budget'

describe('createRenderBudget: slot math + dirty flags', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('does not paint until markDirty, then respects fps interval', () => {
    const paints: number[] = []
    const budget = createRenderBudget({
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      now: () => 0,
    })

    budget.register('kline-a', {
      fps: 5,
      paint: (now) => {
        paints.push(now)
      },
    })

    budget.tick(0)
    expect(paints).toEqual([])

    budget.markDirty('kline-a')
    budget.tick(0)
    expect(paints).toEqual([0])

    budget.markDirty('kline-a')
    budget.tick(100) // < 200ms for 5fps
    expect(paints).toEqual([0])

    budget.tick(200)
    expect(paints).toEqual([0, 200])
  })

  it('clears dirty after paint; second tick without markDirty is a no-op', () => {
    let count = 0
    const budget = createRenderBudget({
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      now: () => 0,
    })
    budget.register('tape', {
      fps: 5,
      paint: () => {
        count += 1
      },
    })
    budget.markDirty('tape')
    budget.tick(0)
    budget.tick(1000)
    expect(count).toBe(1)
  })

  it('skips paint when isVisible is false but preserves dirty for later', () => {
    let visible = false
    let count = 0
    const budget = createRenderBudget({
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      now: () => 0,
    })
    budget.register('ladder', {
      fps: 10,
      isVisible: () => visible,
      paint: () => {
        count += 1
      },
    })
    budget.markDirty('ladder')
    budget.tick(0)
    expect(count).toBe(0)

    visible = true
    budget.tick(100)
    expect(count).toBe(1)
  })

  it('paintedLastSecond counts paints in the rolling 1s window', () => {
    const budget = createRenderBudget({
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      now: () => 5000,
    })
    budget.register('a', {
      fps: 60,
      paint: () => {},
    })
    budget.markDirty('a')
    budget.tick(4000)
    budget.markDirty('a')
    budget.tick(4500)
    budget.markDirty('a')
    budget.tick(5100) // drops the 4000 paint from the window
    expect(budget.paintedLastSecond).toBe(2)
  })
})

describe('createRenderBudget: IntersectionObserver gate (mock)', () => {
  it('useInViewport-style gate: non-intersecting panels never paint', () => {
    const observers: Array<{
      cb: IntersectionObserverCallback
      el: Element
    }> = []

    class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb
      }
      cb: IntersectionObserverCallback
      observe(el: Element) {
        observers.push({ cb: this.cb, el })
      }
      disconnect() {}
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return []
      }
      root = null
      rootMargin = ''
      thresholds: readonly number[] = []
    }

    vi.stubGlobal('IntersectionObserver', MockIO)

    let intersecting = false
    const budget = createRenderBudget({
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      now: () => 0,
    })

    // Simulate the hook updating a ref from IO callbacks.
    const visibleRef = { current: true }
    budget.register('panel', {
      fps: 10,
      isVisible: () => visibleRef.current,
      paint: () => {
        intersecting = true
      },
    })

    const el = document.createElement('div')
    const io = new IntersectionObserver((entries) => {
      visibleRef.current = entries[0]?.isIntersecting ?? false
    })
    io.observe(el)

    const entry = (isIntersecting: boolean): IntersectionObserverEntry =>
      ({
        isIntersecting,
        target: el,
        intersectionRatio: isIntersecting ? 1 : 0,
        time: 0,
        boundingClientRect: el.getBoundingClientRect(),
        intersectionRect: el.getBoundingClientRect(),
        rootBounds: null,
      }) as IntersectionObserverEntry

    observers[0]!.cb([entry(false)], io as IntersectionObserver)
    budget.markDirty('panel')
    budget.tick(0)
    expect(intersecting).toBe(false)

    observers[0]!.cb([entry(true)], io as IntersectionObserver)
    budget.tick(100)
    expect(intersecting).toBe(true)

    vi.unstubAllGlobals()
  })
})

describe('createRenderBudget: paint-count ≤ fps-cap over 60s at 10× data rate', () => {
  it('kline 5fps: ≤300 paints over simulated 60s with markDirty every fake frame', () => {
    const budget = createRenderBudget({
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      now: () => 0,
    })
    let paints = 0
    budget.register('kline', {
      fps: 5,
      paint: () => {
        paints += 1
      },
    })

    // 60s wall, 10× data rate → dirty every frame; rAF ~16.7ms → ~3600 ticks
    const durationMs = 60_000
    const tickMs = 1000 / 60
    for (let t = 0; t < durationMs; t += tickMs) {
      budget.markDirty('kline')
      budget.tick(t)
    }

    const maxPaints = 5 * 60 // fps × seconds
    expect(paints).toBeLessThanOrEqual(maxPaints)
    // 16.67ms tick quantization gives ~3.5% slot drift; allow 10% slack, still proves cadence
    expect(paints).toBeGreaterThan(maxPaints - Math.ceil(maxPaints * 0.1))
  })

  it('ladder 10fps: ≤600 paints over simulated 60s', () => {
    const budget = createRenderBudget({
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: () => {},
      now: () => 0,
    })
    let paints = 0
    budget.register('ladder', {
      fps: 10,
      paint: () => {
        paints += 1
      },
    })
    const durationMs = 60_000
    const tickMs = 1000 / 60
    for (let t = 0; t < durationMs; t += tickMs) {
      budget.markDirty('ladder')
      budget.tick(t)
    }
    expect(paints).toBeLessThanOrEqual(10 * 60)
    expect(paints).toBeGreaterThan(10 * 60 - Math.ceil(10 * 60 * 0.1))
  })
})
