import type { IconName } from '@/components/ui/icons'

// One table for the grid and the detail page, which must not disagree about a state's
// name. Tailwind reads these class literals out of this file.
export interface DriftPresentation {
  icon: IconName
  label: string
  classes: string
}

const UNKNOWN: DriftPresentation = { icon: 'info', label: 'Unknown', classes: 'text-muted border-border' }

// Both spellings are keyed: the older hyphenated form has been seen on the wire.
const STATES: Record<string, DriftPresentation> = {
  'in-sync': { icon: 'check', label: 'In sync', classes: 'text-success border-success/40' },
  diverged: { icon: 'alert', label: 'Diverged', classes: 'text-danger border-danger/40' },
  live_only: { icon: 'info', label: 'Live only', classes: 'text-warning border-warning/40' },
  'live-only': { icon: 'info', label: 'Live only', classes: 'text-warning border-warning/40' },
  git_only: { icon: 'info', label: 'Git only', classes: 'text-info border-info/40' },
  'git-only': { icon: 'info', label: 'Git only', classes: 'text-info border-info/40' },
  unknown: UNKNOWN,
}

export function driftPresentation(status: string): DriftPresentation {
  return STATES[status] ?? { ...UNKNOWN, label: status }
}
