/**
 * When true, the kline chart panel is not mounted and kline-driven React state
 * should be omitted (see useBinanceMarket `omitKlineState`).
 *
 * `VITE_HIDE_CHART=1` or `localStorage['trading-ui.hide-chart'] === '1'` (+ reload).
 */
export function readHideChartFlag(): boolean {
  if (
    import.meta.env.VITE_HIDE_CHART === '1' ||
    import.meta.env.VITE_HIDE_CHART === 'true'
  ) {
    return true
  }
  try {
    return localStorage.getItem('trading-ui.hide-chart') === '1'
  } catch {
    return false
  }
}
