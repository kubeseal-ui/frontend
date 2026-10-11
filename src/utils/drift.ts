import type { IconName } from '@/components/ui/icons'

// One table for the namespace index, the search results, the namespace page and the Secret
// surface, which must not disagree about a state's name. Tailwind reads these class literals
// out of this file.
export interface DriftPresentation {
  icon: IconName
  label: string
  classes: string
  /** The row's left edge. Transparent for a state with nothing to report, so a page of clean
   *  rows has no coloured column and the one that drifted is the only mark on it. */
  gutter: string
}

const UNKNOWN: DriftPresentation = {
  icon: 'info',
  label: 'Unknown',
  classes: 'text-muted border-border',
  gutter: 'border-l-border-strong',
}

// Both spellings are keyed: the older hyphenated form has been seen on the wire.
const STATES: Record<string, DriftPresentation> = {
  'in-sync': { icon: 'check', label: 'In sync', classes: 'text-success border-success/40', gutter: 'border-l-transparent' },
  diverged: { icon: 'alert', label: 'Diverged', classes: 'text-danger border-danger/40', gutter: 'border-l-danger' },
  live_only: { icon: 'info', label: 'Live only', classes: 'text-warning border-warning/40', gutter: 'border-l-warning' },
  'live-only': { icon: 'info', label: 'Live only', classes: 'text-warning border-warning/40', gutter: 'border-l-warning' },
  git_only: { icon: 'info', label: 'Git only', classes: 'text-info border-info/40', gutter: 'border-l-info' },
  'git-only': { icon: 'info', label: 'Git only', classes: 'text-info border-info/40', gutter: 'border-l-info' },
  unknown: UNKNOWN,
}

export function driftPresentation(status: string): DriftPresentation {
  return STATES[status] ?? { ...UNKNOWN, label: status }
}

// Why the two sides disagree, in the product's own words. Every sentence is a claim about the
// documents only: the report compares ciphertext and never decrypts, so none of these may say that
// the values match — "the encrypted values are the same" is the most any of them has established.
const REASONS: Record<string, string> = {
  ciphertext:
    'The file and the cluster hold separate encryptions of the same keys. Sealing is not deterministic, so re-sealing unchanged values produces this.',
  keys: 'The file and the cluster do not carry the same key names.',
  template: 'The Secret template differs. The encrypted values on both sides are the same.',
  metadata: 'The encrypted values on both sides are the same. What differs is the document around them.',
  identity: 'The file at this path is a manifest for a different Secret.',
}

/** The sentence for a diverged Secret's reason. Empty for a payload that carries none, which is
 *  every drift but `diverged` and every response from a server older than the field. */
export function driftReasonSentence(reason?: string): string {
  return reason ? REASONS[reason] ?? '' : ''
}

// The paths are the answer, so they are named rather than counted; the cap only keeps a Secret with
// a hundred resealed keys from filling the alert with a paragraph of field names.
const MAX_FIELDS = 6

/** The differing paths as one line: `a.b, a.c and 3 more`. */
export function driftFieldList(fields?: string[]): string {
  if (!fields?.length) return ''
  const shown = fields.slice(0, MAX_FIELDS)
  const rest = fields.length - shown.length
  return rest > 0 ? `${shown.join(', ')} and ${rest} more` : shown.join(', ')
}
