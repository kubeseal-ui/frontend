export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
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
