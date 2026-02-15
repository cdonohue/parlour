const UNITS: [number, string][] = [
  [60, 's'],
  [60, 'm'],
  [24, 'h'],
  [7, 'd'],
  [4.35, 'w'],
  [12, 'mo'],
]

export function relativeTime(ts: number): string {
  let delta = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (delta < 10) return 'just now'

  for (const [divisor, unit] of UNITS) {
    if (delta < divisor) return `${delta}${unit} ago`
    delta = Math.floor(delta / divisor)
  }
  return `${delta}y ago`
}
