export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

/** A date as the day it names, in UTC. Deliberately not `toLocaleDateString`: the value comes
 *  from the cluster and reads the same to every operator, and a locale-dependent render would
 *  make the row unassertable. Anything unparseable is shown as it arrived rather than as
 *  "Invalid Date". */
export function formatDate(value: string): string {
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? value : at.toISOString().slice(0, 10)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The same day as `formatDate`, said the way a row says it: "created 14 Aug 2026". Read in
 *  UTC and spelled out rather than localised, for the reason above — the value came from the
 *  cluster and every operator must read the same row. The API has no `updated_at`, so a row
 *  says when the Secret was made and nothing that would imply it moved since. */
export function formatCreatedDate(value: string): string {
  const at = new Date(value)
  if (Number.isNaN(at.getTime())) return value
  return `created ${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${at.getUTCFullYear()}`
}
