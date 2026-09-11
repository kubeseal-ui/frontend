import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/api'
import { useSecretsStore } from '@/stores/secrets'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

describe('phase 3 secret workflow', () => {
  it('sends a one-key diff request with an idempotency key', async () => {
    const request = vi.spyOn(api, 'post').mockResolvedValue({ data: { before: 'encrypted-before', after: 'encrypted-after', checksum: 'sum' } } as never)
    await useSecretsStore().computeDiff('payments', 'api', 'password', 'replace', 'new', 'abc')
    expect(request).toHaveBeenCalledWith('/api/v1/secrets/payments/api/diff', { key: 'password', operation: 'replace', value: 'new', base_commit: 'abc' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
  })

  it('applies the reviewed one-key mutation and stores encrypted output only', async () => {
    vi.spyOn(api, 'post').mockResolvedValue({ data: { before: 'before', after: 'after', key: 'password', base_commit: 'abc', checksum: 'sum' } } as never)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { yaml: 'encrypted-updated', checksum: 'sum', diff_before: 'before', diff_after: 'after' } } as never)
    const store = useSecretsStore()
    await store.computeDiff('payments', 'api', 'password', 'replace', 'new', 'abc')
    await store.applyReviewedMutation()
    expect(patch).toHaveBeenCalledWith('/api/v1/secrets/payments/api/values/password', { value: 'new', base_commit: 'abc', operation: 'replace' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
    expect(store.currentDetail).toBeNull()
  })

  it('delivers using the server-selected mode and returns the result', async () => {
    const request = vi.spyOn(api, 'post').mockResolvedValue({ data: { mode: 'proposal', commit_sha: 'abc', proposal_url: 'https://git.example/pr/1' } } as never)
    const result = await useSecretsStore().deliver('payments', 'api', 'encrypted-yaml', 'base')
    expect(result.proposal_url).toContain('/pr/1')
    expect(request).toHaveBeenCalledWith('/api/v1/gitops/deliver', { namespace: 'payments', name: 'api', yaml: 'encrypted-yaml', base_commit: 'base' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
  })
})
