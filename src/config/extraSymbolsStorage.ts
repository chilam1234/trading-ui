const STORAGE_KEY = 'trading-ui.extra-symbols'

export function loadExtraSymbols(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    const out: string[] = []
    for (const x of parsed) {
      if (typeof x === 'string' && /^[a-z0-9]+$/i.test(x)) {
        out.push(x.toLowerCase())
      }
    }
    return [...new Set(out)].sort()
  } catch {
    return []
  }
}

export function saveExtraSymbols(symbols: readonly string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...symbols].sort()))
}
