const EXCHANGE_INFO_PATH = '/api/v3/exchangeInfo'

function exchangeInfoUrl(): string {
  if (import.meta.env.VITE_EXCHANGE_PROXY === '1') {
    return `/binance-api${EXCHANGE_INFO_PATH}`
  }
  return import.meta.env.DEV
    ? `/binance-api${EXCHANGE_INFO_PATH}`
    : `https://api.binance.com${EXCHANGE_INFO_PATH}`
}

type ExchangeSymbol = {
  symbol: string
  status: string
  quoteAsset?: string
}

type ExchangeInfoResponse = {
  symbols: ExchangeSymbol[]
}

/**
 * USDT spot symbols that are trading (lowercase), sorted.
 */
export async function fetchUsdtTradingSymbols(): Promise<string[]> {
  let res: Response
  try {
    res = await fetch(exchangeInfoUrl())
  } catch (e: unknown) {
    const detail = e instanceof Error ? e.message : String(e)
    throw new Error(
      `exchangeInfo request failed (${detail}). If the browser blocks cross-origin ` +
        'requests (CORS), build with VITE_EXCHANGE_PROXY=1 and serve behind a same-origin ' +
        '/binance-api proxy (see DEPLOY.md), or use a Cloudflare Worker.',
    )
  }
  if (!res.ok) {
    throw new Error(`exchangeInfo ${res.status}`)
  }
  const data = (await res.json()) as ExchangeInfoResponse
  if (!Array.isArray(data.symbols)) {
    throw new Error('exchangeInfo: invalid response')
  }
  const out: string[] = []
  for (const s of data.symbols) {
    if (s.status !== 'TRADING') continue
    if (s.quoteAsset !== 'USDT') continue
    out.push(s.symbol.toLowerCase())
  }
  out.sort()
  return out
}
