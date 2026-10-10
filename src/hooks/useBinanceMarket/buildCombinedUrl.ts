export function buildCombinedUrl(streams: string[], host: string): string {
  const path = streams.map((s) => encodeURIComponent(s)).join('/')
  return `${host.replace(/\/$/, '')}/stream?streams=${path}`
}
