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

/** Matches Secret names and key names; key names already ride in the listing, so nothing here is plaintext. */
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

export interface HighlightSegment {
  text: string
  /** True for the runs that matched, so a row can mark why it is in the list. */
  hit: boolean
}

/** Splits `text` into matched and unmatched runs, returned as data rather than markup so the product never needs v-html. An empty query is one unmatched run. */
export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [{ text, hit: false }]

  const haystack = text.toLowerCase()
  const segments: HighlightSegment[] = []
  let cursor = 0
  // A zero-length match would never advance `cursor`, which is why the empty needle returns above.
  for (let found = haystack.indexOf(needle); found !== -1; found = haystack.indexOf(needle, cursor)) {
    if (found > cursor) segments.push({ text: text.slice(cursor, found), hit: false })
    segments.push({ text: text.slice(found, found + needle.length), hit: true })
    cursor = found + needle.length
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), hit: false })
  return segments
}

