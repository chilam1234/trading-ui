/** Common Binance spot quote assets, longest first for suffix matching. */
const QUOTE_SUFFIXES = [
  'USDT',
  'USDC',
  'FDUSD',
  'TUSD',
  'BUSD',
  'EUR',
  'BTC',
  'ETH',
  'BNB',
] as const

/**
 * Display label e.g. `BTCUSDT` → `BTC USDT`. Falls back to uppercase symbol if no suffix matches.
 */
export function formatPairLabel(symbol: string): string {
  const u = symbol.toUpperCase()
  for (const q of QUOTE_SUFFIXES) {
    if (u.endsWith(q)) {
      const base = u.slice(0, -q.length)
      if (base.length > 0) return `${base} ${q}`
    }
  }
  return u
}
