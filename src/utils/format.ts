/**
 * Small text builders shared by more than one surface.
 */

/**
 * A count with its noun, correct at one.
 *
 * Two pages print a key count — the namespace card and the detail header — and
 * both said "keys" unconditionally, so a SealedSecret holding a single value
 * read as "1 keys". The count is the server's; only the noun is built here.
 */
export function countLabel(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
