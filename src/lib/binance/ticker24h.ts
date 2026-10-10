import { binanceSpotApiUrl } from './binanceRestBase'

/** Subset of GET /api/v3/ticker/24hr fields we display. */
export type Ticker24hRow = {
  symbol: string
  lastPrice: string
  priceChangePercent: string
  quoteVolume: string
  volume: string
}

function parseTicker(o: unknown): Ticker24hRow | null {
  if (!o || typeof o !== 'object') return null
  const r = o as Record<string, unknown>
  const symbol = r.symbol
  const lastPrice = r.lastPrice
  const priceChangePercent = r.priceChangePercent
  const quoteVolume = r.quoteVolume
  const volume = r.volume
  if (
    typeof symbol !== 'string' ||
    typeof lastPrice !== 'string' ||
    typeof priceChangePercent !== 'string' ||
    typeof quoteVolume !== 'string' ||
    typeof volume !== 'string'
  ) {
    return null
  }
  return {
    symbol,
    lastPrice,
    priceChangePercent,
    quoteVolume,
    volume,
  }
}

/**
 * Batch 24h tickers for multiple symbols (one REST call).
 * @see https://developers.binance.com/docs/binance-spot-api-docs/rest-api#symbol-price-ticker
 */
export async function fetchTicker24hrBatch(
  symbolsUpper: readonly string[],
): Promise<Record<string, Ticker24hRow>> {
  if (symbolsUpper.length === 0) return {}
  const uniq = [...new Set(symbolsUpper.map((s) => s.toUpperCase()))]
  const qs = encodeURIComponent(JSON.stringify(uniq))
  const url = `${binanceSpotApiUrl('/api/v3/ticker/24hr')}?symbols=${qs}`
  let res: Response
  try {
    res = await fetch(url)
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new Error(
      `ticker/24hr failed (${detail}). Use VITE_EXCHANGE_PROXY=1 if CORS blocks.`,
    )
  }
  if (!res.ok) {
    throw new Error(`ticker/24hr ${res.status}`)
  }
  const data: unknown = await res.json()
  const out: Record<string, Ticker24hRow> = {}
  if (Array.isArray(data)) {
    for (const row of data) {
      const t = parseTicker(row)
      if (t) out[t.symbol] = t
    }
    return out
  }
  const single = parseTicker(data)
  if (single) out[single.symbol] = single
  return out
}
