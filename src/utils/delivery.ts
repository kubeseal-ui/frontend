import type { Capability, DeliveryResult } from '@/types'

export function deliveryHeading(outcome: DeliveryResult, direct = 'Delivered directly'): string {
  return outcome.mode === 'proposal' ? 'Proposal opened' : direct
}

export function summarizeDelivery(
  outcome: DeliveryResult,
  options: { branch?: string; file?: string; verb?: string } = {},
): string {
  const branch = outcome.branch || options.branch || ''
  const file = outcome.file_path || options.file || ''
  const to = branch ? ` to ${branch}` : ''
  const at = file ? ` at ${file}` : ''
  const sha = outcome.commit_sha ? outcome.commit_sha.slice(0, 7) : 'the commit'
  const verb = options.verb || (outcome.mode === 'proposal' ? 'Pushed' : 'Committed')
  const tail = outcome.mode === 'proposal' ? ' and opened a merge proposal.' : '.'
  return `${verb} ${sha}${to}${at}${tail}`
}

export function requiredDeliveryCapability(mode: string): Capability | null {
  if (mode === 'direct') return 'gitops:push'
  if (mode === 'proposal') return 'gitops:propose'
  return null
}
