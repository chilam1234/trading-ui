import { useEffect, useState, type RefObject } from 'react'

/**
 * True when `ref` intersects the viewport (IntersectionObserver).
 * Defaults to `true` until the first observation so first paint is not skipped.
 */
export function useInViewport(ref: RefObject<Element | null>): boolean {
  const [inView, setInView] = useState(true)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const io = new IntersectionObserver((entries) => {
      const entry = entries[0]
      if (entry) setInView(entry.isIntersecting)
    })
    io.observe(el)
    return () => io.disconnect()
  }, [ref])

  return inView
}
