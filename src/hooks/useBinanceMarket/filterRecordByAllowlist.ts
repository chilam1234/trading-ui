/** Immutable filter: drop keys where `keep(key)` is false. Returns `prev` if unchanged. */
export function filterRecordKeepingKeys<T>(
  prev: Record<string, T>,
  keep: (key: string) => boolean,
): Record<string, T> {
  let changed = false
  for (const key of Object.keys(prev)) {
    if (!keep(key)) {
      changed = true
      break
    }
  }
  if (!changed) return prev
  const next: Record<string, T> = { ...prev }
  for (const key of Object.keys(prev)) {
    if (!keep(key)) delete next[key]
  }
  return next
}
