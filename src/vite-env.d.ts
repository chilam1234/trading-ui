/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to `"1"` to subscribe to extra high-volume streams in dev (load test). */
  readonly VITE_BINANCE_LOADTEST?: string
  /** `backend-fanout` uses app backend WS instead of direct Binance WS. */
  readonly VITE_MARKET_SOURCE?: 'direct-binance' | 'backend-fanout'
  /** Backend fanout websocket URL (used when VITE_MARKET_SOURCE=backend-fanout). */
  readonly VITE_FANOUT_WS_URL?: string
  /**
   * When `"1"`, `exchangeInfo` uses same-origin `/binance-api` (nginx proxy in Docker/production).
   * Avoids browser CORS when the static app cannot call `api.binance.com` directly.
   */
  readonly VITE_EXCHANGE_PROXY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
