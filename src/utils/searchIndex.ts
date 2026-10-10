import type { SealedSecretSummary } from '@/types'

export interface SearchHit {
  namespace: string
  name: string
  key_count: number
  scope: string
  drift: string
  /** The key names that matched, so a row can say why it is in the list. */
  matchedKeys: string[]
}

/** Matches Secret names and key names. Key names already ride in the listing, so a match on
 *  `DATABASE_URL` costs no request and nothing here is plaintext. */
export function searchSecrets(index: SealedSecretSummary[], query: string): SearchHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []

  const hits: SearchHit[] = []
  for (const secret of index) {
    const matchedKeys = (secret.keys ?? []).filter((key) => key.toLowerCase().includes(needle))
    if (!secret.name.toLowerCase().includes(needle) && matchedKeys.length === 0) continue
    hits.push({
      namespace: secret.namespace,
      name: secret.name,
      key_count: secret.key_count,
      scope: secret.scope || 'strict',
      drift: secret.git?.drift || 'unknown',
      matchedKeys,
    })
  }
  return hits.sort(
    (a, b) => a.namespace.localeCompare(b.namespace) || a.name.localeCompare(b.name),
  )
}
