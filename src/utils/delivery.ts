import type { Capability, DeliveryResult } from '@/types'

/**
 * How a delivery reports itself, in one place.
 *
 * Three screens can write to Git — the delivery panel (for an edit and for a
 * new Secret) and the sync control on the detail page — and they used to report
 * it to three different depths. The panel named the commit, the branch, and the
 * file; the detail page printed the mode and a seven-character hash and dropped
 * the proposal URL. One builder means one account of what happened, whichever
 * control did it, and a field the server starts sending reaches every screen at
 * once instead of only the one somebody remembered.
 *
 * Both endpoints answer with the same shape (see GitOpsDeliverHandler and
 * GitOpsSyncHandler in api/internal/handlers/gitops.go), which is what makes a
 * shared builder correct rather than merely convenient.
 */

/** The heading for an outcome: what kind of thing just happened. */
export function deliveryHeading(outcome: DeliveryResult, direct = 'Delivered directly'): string {
  return outcome.mode === 'proposal' ? 'Proposal opened' : direct
}

/**
 * What was written, in one sentence.
 *
 * `branch` and `file` are fallbacks for values the response may not carry, and
 * they are not guesses: each is a value the server itself produced earlier in
 * the same flow — the namespace's policy branch, the path the dry run resolved,
 * or the file discovery found the manifest in. A caller passes what it holds;
 * an absent fallback simply leaves that clause out, so a push with no branch
 * still reports its commit and file rather than inventing a destination.
 *
 * `verb` overrides the mode's default so the sentence can follow the control
 * that was pressed: a sync says it synced where a delivery says it committed.
 */
export function summarizeDelivery(
  outcome: DeliveryResult,
  options: { branch?: string; file?: string; verb?: string } = {},
): string {
  const branch = outcome.branch || options.branch || ''
  const file = outcome.file_path || options.file || ''
  const to = branch ? ` to ${branch}` : ''
  const at = file ? ` at ${file}` : ''
  // A response with no commit at all still gets a sentence that reads: the
  // server reports one for every successful push, so this is the shape of a
  // server that answered without it rather than a normal case.
  const sha = outcome.commit_sha ? outcome.commit_sha.slice(0, 7) : 'the commit'
  const verb = options.verb || (outcome.mode === 'proposal' ? 'Pushed' : 'Committed')
  const tail = outcome.mode === 'proposal' ? ' and opened a merge proposal.' : '.'
  return `${verb} ${sha}${to}${at}${tail}`
}

/**
 * Whether the delivery capability this namespace's policy requires is held.
 *
 * Delivery mode is never a user choice — it comes from the authorization
 * ConfigMap via the server — so the control that carries it out is gated on the
 * capability that mode implies: a proposal needs `gitops:propose`, a direct
 * push needs `gitops:push`.
 */
export function requiredDeliveryCapability(mode: string): Capability | null {
  if (mode === 'direct') return 'gitops:push'
  if (mode === 'proposal') return 'gitops:propose'
  return null
}
