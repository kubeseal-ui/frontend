import type { Capability } from '@/types'

/** The grants worth naming, in the order they are spoken. `metadata:read` is deliberately absent: it puts a namespace on screen at all, so naming it would print the same chip on every row. */
export const CAPABILITY_LABELS: { capability: Capability; label: string }[] = [
  { capability: 'secret:seal', label: 'Seal' },
  { capability: 'secret:decrypt', label: 'Reveal' },
  { capability: 'gitops:push', label: 'Push' },
  { capability: 'gitops:propose', label: 'Propose' },
  { capability: 'access:manage', label: 'Admin' },
]

/** Takes the predicate rather than the auth store, so the list and the policy stay separable and the order lives in one place. */
export function grantLabels(has: (capability: Capability) => boolean): string[] {
  return CAPABILITY_LABELS.filter((entry) => has(entry.capability)).map((entry) => entry.label)
}
