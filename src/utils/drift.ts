import type { IconName } from '@/components/ui/icons'

/**
 * The drift vocabulary, in one place.
 *
 * The namespace grid names a drift state on every card and in its filter chips,
 * and the detail page names the same state in prose above the editor. Two copies
 * of this table let one page call a Secret "Live only" while the next called it
 * "live_only" — and the API sends the underscored spelling, so the prose copy is
 * the one that would have shipped the raw enum.
 *
 * The colour lives here as a class rather than in the stylesheet so the
 * vocabulary and its treatment sit next to each other. Tailwind reads these
 * literals out of this file, which is what keeps border-success/40 a real
 * utility rather than a generated-name lookalike.
 *
 * The glyph is not decoration: it is what keeps a state from being conveyed by
 * colour alone, so it survives a monochrome display, a colour-blind reader, and
 * a screen reader.
 */
export interface DriftPresentation {
  icon: IconName
  label: string
  classes: string
}

/** The treatment for a state that is not a drift state at all, and the base case for one we do not know. */
const UNKNOWN: DriftPresentation = { icon: 'info', label: 'Unknown', classes: 'text-muted border-border' }

/**
 * Both spellings of each state are keyed, because the two-tier Git lookup
 * (`git_only`, `live_only`) and the older hyphenated form have both been seen on
 * the wire and neither is worth a page that says nothing.
 */
const STATES: Record<string, DriftPresentation> = {
  'in-sync': { icon: 'check', label: 'In sync', classes: 'text-success border-success/40' },
  diverged: { icon: 'alert', label: 'Diverged', classes: 'text-danger border-danger/40' },
  live_only: { icon: 'info', label: 'Live only', classes: 'text-warning border-warning/40' },
  'live-only': { icon: 'info', label: 'Live only', classes: 'text-warning border-warning/40' },
  git_only: { icon: 'info', label: 'Git only', classes: 'text-info border-info/40' },
  'git-only': { icon: 'info', label: 'Git only', classes: 'text-info border-info/40' },
  unknown: UNKNOWN,
}

/**
 * The presentation for one drift state.
 *
 * A state this build does not know is shown as the server spelled it rather
 * than as a blank label: an unrecognised value is still information, and hiding
 * it would leave a chip that says nothing at all.
 */
export function driftPresentation(status: string): DriftPresentation {
  return STATES[status] ?? { ...UNKNOWN, label: status }
}
