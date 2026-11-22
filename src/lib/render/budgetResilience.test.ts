import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderBudget } from './budget'

/** Drive the shared rAF loop by hand: queue callbacks, then pop and run them. */
function harness() {
  const queue: FrameRequestCallback[] = []
  let now = 0
  const budget = createRenderBudget({
    requestAnimationFrame: (cb) => {
      queue.push(cb)
      return queue.length
    },
    cancelAnimationFrame: (id) => {
      queue.splice(id - 1, 1)
    },
    now: () => now,
  })
  // Advance past the 60fps (16.67ms) interval gate unless told otherwise.
  const frame = (advanceMs = 20) => {
    now += advanceMs
    const cb = queue.shift()
    cb?.(now)
  }
  return {
    budget,
    frame,
    get pending() {
      return queue.length
    },
  }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('render budget: a failing panel must not stop the shared loop', () => {
  it('keeps painting healthy panels after another panel throws', () => {
    const h = harness()
    const goodPaints: number[] = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    h.budget.register('bad', {
      fps: 60,
      paint: () => {
        throw new Error('boom')
      },
    })
    h.budget.register('good', {
      fps: 60,
      paint: (now) => goodPaints.push(now),
    })

    h.budget.markDirty('bad')
    h.budget.markDirty('good')
    h.frame()

    // The throwing panel must not abort the other panels in the same tick.
    expect(goodPaints).toHaveLength(1)

    // …and the loop must still be scheduled for the next frame.
    expect(h.pending).toBeGreaterThan(0)

    h.budget.markDirty('good')
    h.frame()
    expect(goodPaints).toHaveLength(2)

    h.budget.markDirty('good')
    h.frame()
    expect(goodPaints).toHaveLength(3)

    errorSpy.mockRestore()
    h.budget.reset()
  })

  it('logs a failing panel once, not on every frame', () => {
    const h = harness()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    h.budget.register('bad', {
      fps: 60,
      paint: () => {
        throw new Error('boom')
      },
    })

    for (let i = 0; i < 5; i++) {
      h.budget.markDirty('bad')
      h.frame()
    }

    expect(errorSpy).toHaveBeenCalledTimes(1)
    errorSpy.mockRestore()
    h.budget.reset()
  })

  it('keeps painting when a visibility predicate throws', () => {
    const h = harness()
    const goodPaints: number[] = []
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    h.budget.register('broken-visible', {
      fps: 60,
      isVisible: () => {
        throw new Error('io')
      },
      paint: () => {},
    })
    h.budget.register('good', {
      fps: 60,
      paint: (now) => goodPaints.push(now),
    })

    h.budget.markDirty('broken-visible')
    h.budget.markDirty('good')
    h.frame()

    expect(goodPaints).toHaveLength(1)
    expect(h.pending).toBeGreaterThan(0)

    errorSpy.mockRestore()
    h.budget.reset()
  })
})
