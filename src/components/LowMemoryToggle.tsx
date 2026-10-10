import { useCallback, useState, type ChangeEvent } from 'react'
import {
  isLowMemoryMode,
  setLowMemoryMode,
} from '../lib/render/canvasDpr'

/** Header toggle: persists `trading-ui.low-memory` and caps canvas DPR to 1. */
export function LowMemoryToggle() {
  const [on, setOn] = useState(() => isLowMemoryMode())

  const onChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.checked
    setOn(next)
    setLowMemoryMode(next)
  }, [])

  return (
    <label className="low-memory-toggle" title="Cap canvas DPR to 1 and tighten paint">
      <input
        type="checkbox"
        checked={on}
        onChange={onChange}
      />
      <span>Low memory</span>
    </label>
  )
}
