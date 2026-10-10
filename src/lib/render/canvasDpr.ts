/** Persisted low-memory mode (DPR=1, tighter paint policy). */
export const LOW_MEMORY_STORAGE_KEY = 'trading-ui.low-memory'

/** Soft cap on canvas backing-store device pixel ratio (ADR-0009). */
export const CANVAS_DPR_CAP = 1.5

export const DPR_CHANGED_EVENT = 'trading-ui:dpr-changed'

let installed = false
let nativeGet: (() => number) | null = null

export function isLowMemoryMode(): boolean {
  try {
    return localStorage.getItem(LOW_MEMORY_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setLowMemoryMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(LOW_MEMORY_STORAGE_KEY, '1')
    else localStorage.removeItem(LOW_MEMORY_STORAGE_KEY)
  } catch {
    // ignore quota / private mode
  }
  notifyDprChanged()
}

/** Effective canvas DPR: 1 in low-memory mode, else min(native, 1.5). */
export function getCanvasDpr(nativeDpr?: number): number {
  if (isLowMemoryMode()) return 1
  const native =
    nativeDpr ??
    (typeof window !== 'undefined' ? readNativeDevicePixelRatio() : 1)
  return Math.min(Math.max(native, 1), CANVAS_DPR_CAP)
}

function readNativeDevicePixelRatio(): number {
  if (nativeGet) return nativeGet()
  return typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
}

/**
 * Cap `window.devicePixelRatio` so lightweight-charts / fancy-canvas backing
 * stores honor ADR-0009 without a custom chart fork.
 */
export function installCanvasDprCap(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  const desc = Object.getOwnPropertyDescriptor(window, 'devicePixelRatio')
  if (desc?.get) {
    nativeGet = () => desc.get!.call(window) as number
  } else {
    const fixed = window.devicePixelRatio || 1
    nativeGet = () => fixed
  }

  try {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      enumerable: true,
      get() {
        return getCanvasDpr(nativeGet?.() ?? 1)
      },
    })
  } catch {
    // Non-configurable in some test envs — getCanvasDpr still works for callers.
  }
}

export function notifyDprChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(DPR_CHANGED_EVENT))
}
