import { useCallback, useEffect, useRef, useState } from 'react'

const STORAGE_KEY = 'trading-ui.selected-pairs'

function loadFromStorage(allowed: Set<string>): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return new Set(allowed)
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set(allowed)
    const next = new Set<string>()
    for (const x of parsed) {
      if (typeof x !== 'string') continue
      const u = x.toUpperCase()
      if (allowed.has(u)) next.add(u)
    }
    return next.size > 0 ? next : new Set(allowed)
  } catch {
    return new Set(allowed)
  }
}

function saveToStorage(selected: Set<string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected].sort()))
}

/**
 * Selected pairs for UI (tape + order books). Selection is only meaningful for
 * **subscribed** symbols (from WebSocket streams). After the first load, whenever
 * the subscribed set changes, selection resets to **all** allowed pairs so new streams
 * show tape/books without extra clicks.
 */
export function useSelectedStreamPairs(subscribedSymbols: readonly string[]) {
  const allowedKey = [...subscribedSymbols].sort().join(',')
  const didInitRef = useRef(false)
  const skipFirstSaveRef = useRef(true)

  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    const allowed = new Set(
      subscribedSymbols.map((s) => s.toUpperCase()),
    )
    queueMicrotask(() => {
      if (allowed.size === 0) {
        setSelected(new Set())
        return
      }
      if (!didInitRef.current) {
        didInitRef.current = true
        setSelected(loadFromStorage(allowed))
        return
      }
      // Subscription list changed: show every subscribed pair by default (new streams appear selected).
      setSelected(new Set(allowed))
    })
  }, [allowedKey, subscribedSymbols])

  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false
      return
    }
    saveToStorage(selected)
  }, [selected])

  const toggle = useCallback((sym: string) => {
    const u = sym.toUpperCase()
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(u)) next.delete(u)
      else next.add(u)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelected(new Set(subscribedSymbols.map((s) => s.toUpperCase())))
  }, [subscribedSymbols])

  const clearAll = useCallback(() => {
    setSelected(new Set())
  }, [])

  return {
    selectedPairs: selected,
    togglePair: toggle,
    selectAllPairs: selectAll,
    clearAllPairs: clearAll,
  }
}
