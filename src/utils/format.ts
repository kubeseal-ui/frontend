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
