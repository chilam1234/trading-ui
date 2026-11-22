import type { CandlestickData } from 'lightweight-charts'

/**
 * FNV-1a over the exact IEEE-754 bits of the first `n` candles (time, open, high,
 * low, close). Bit-exact and allocation-free: the five fields are written into one
 * reused Float64Array and read back through a Uint32Array view, so no per-row
 * string or object is created.
 *
 * Why a full-prefix hash rather than the last row: the previous implementation
 * compared a single row of the prefix, so a revision to any *earlier* candle (a
 * late or corrected kline that keeps the array length the same) produced an
 * identical signature and the chart kept painting stale data. Hashing the whole
 * prefix makes any change anywhere in it detectable.
 *
 * Collision caveat: this is 32 bits, so two different prefixes collide with
 * probability ~2^-32 per comparison. At ~5 paints/second that is far below any
 * realistic rate, and a collision only defers a repaint until the next change
 * rather than corrupting anything else — an acceptable trade for zero allocation
 * on a 60fps-adjacent path.
 */
const FNV_OFFSET = 2166136261
const FNV_PRIME = 16777619
const FIELDS_PER_ROW = 5
const floatScratch = new Float64Array(FIELDS_PER_ROW)
const u32Scratch = new Uint32Array(floatScratch.buffer)

export function candlePrefixHash(
  c: readonly CandlestickData[],
  n: number,
): number {
  let h = FNV_OFFSET
  const len = Math.min(n, c.length)
  for (let i = 0; i < len; i++) {
    const x = c[i]!
    floatScratch[0] = Number(x.time)
    floatScratch[1] = x.open
    floatScratch[2] = x.high
    floatScratch[3] = x.low
    floatScratch[4] = x.close
    for (let j = 0; j < FIELDS_PER_ROW * 2; j++) {
      h = Math.imul(h ^ u32Scratch[j]!, FNV_PRIME)
    }
  }
  return h >>> 0
}

export type CandleUpdatePlan = 'update-last' | 'set-data'

export type CandleUpdateState = {
  /** Length of the previously painted array. */
  prevLen: number
  /** Hash of prev[0..prevLen-1) — the painted series without its final row. */
  prevHeadHash: number
  /** Hash of prev[0..prevLen) — every row painted last time. */
  prevFullHash: number
  /**
   * `Number(time)` of the final painted row. `series.update()` on an equal-length
   * array is only a same-bar repaint when the time is unchanged; a moved time is
   * a new bar, and calling update() with it would append a duplicate instead of
   * replacing the old final bar.
   */
  prevLastTime: number
}

/**
 * Decide whether `series.update(last)` is enough or the whole series needs `setData`.
 *
 * `update-last` is valid in exactly two shapes:
 *   1. Same length — only the forming (final) candle changed, so the head is
 *      byte-identical and repainting one row is enough.
 *   2. Grew by one  — `next` is `prev` plus one appended row, so the first
 *      `prevLen` rows hash identically and the new row can be appended.
 *
 * The growth case compares `candlePrefixHash(next, prevLen)` against
 * `prevFullHash`. Both sides describe the same `prevLen` rows. The earlier
 * implementation compared a `prevLen`-row head signature against a `prevLen - 1`
 * one, which could never match because of the length prefix baked into the
 * signature — so every new candle silently fell through to a full `setData`.
 */
export function planCandleUpdate(
  state: CandleUpdateState,
  next: readonly CandlestickData[],
): CandleUpdatePlan {
  // Below two rows there is no "head vs last" split to reason about, and the
  // empty case is the reset path that must run setData + fitContent.
  if (next.length < 2) return 'set-data'

  const { prevLen, prevHeadHash, prevFullHash, prevLastTime } = state
  const lastTime = Number(next[next.length - 1]!.time)

  if (next.length === prevLen) {
    // Same-bar repaint only: the head must be identical *and* the bar time must
    // not have moved. A moved time with an unchanged length is a different bar,
    // and update() would append it rather than replace the stale one.
    if (lastTime !== prevLastTime) return 'set-data'
    return candlePrefixHash(next, next.length - 1) === prevHeadHash
      ? 'update-last'
      : 'set-data'
  }
  if (next.length === prevLen + 1) {
    // A legitimate new bar must be strictly newer than the one it follows.
    if (!(lastTime > prevLastTime)) return 'set-data'
    return candlePrefixHash(next, prevLen) === prevFullHash
      ? 'update-last'
      : 'set-data'
  }
  return 'set-data'
}
