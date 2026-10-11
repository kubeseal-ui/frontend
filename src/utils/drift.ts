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
