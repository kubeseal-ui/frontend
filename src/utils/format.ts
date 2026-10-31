export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** Relative age for a successful refresh timestamp, updated by the owning view on a minute cadence. */
export function formatRelativeUpdate(timestamp: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - timestamp)
  if (elapsed < 60_000) return 'just now'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} min ago`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} hr ago`
  const days = Math.floor(elapsed / 86_400_000)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/** A date as the day it names, in UTC — not `toLocaleDateString`, so every operator reads the same row; unparseable input is echoed. */
export function formatDate(value: string): string {
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? value : at.toISOString().slice(0, 10)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The same day said the way a row says it ("created 14 Aug 2026"); the API has no `updated_at`, so never imply the Secret moved. */
export function formatCreatedDate(value: string): string {
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return value
  return `created ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`
}
