/** Shared REST base for Binance Spot API (same-origin proxy as exchangeInfo). */
export function binanceSpotApiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  if (import.meta.env.VITE_EXCHANGE_PROXY === '1') {
    return `/binance-api${p}`
  }
  return import.meta.env.DEV
    ? `/binance-api${p}`
    : `https://api.binance.com${p}`
}
