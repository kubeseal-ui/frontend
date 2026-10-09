import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { api } from '@/api'
import { useSecretsStore } from '@/stores/secrets'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.restoreAllMocks()
})

describe('phase 3 secret workflow', () => {
  it('sends a batch diff request with an idempotency key', async () => {
    const request = vi.spyOn(api, 'post').mockResolvedValue({ data: { before: 'encrypted-before', after: 'encrypted-after', checksum: 'sum' } } as never)
    const mutations = [
      { key: 'password', operation: 'replace' as const, value: 'new' },
      { key: 'api_key', operation: 'add' as const, value: 'key' },
    ]
    await useSecretsStore().computeDiff('payments', 'api', mutations, 'abc')
    expect(request).toHaveBeenCalledWith('/api/v1/secrets/payments/api/diff', { mutations, base_commit: 'abc' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
  })

  it('applies the reviewed batch and stores encrypted output only', async () => {
    const mutations = [
      { key: 'password', operation: 'replace' as const, value: 'new' },
      { key: 'api_key', operation: 'add' as const, value: 'key' },
    ]
    vi.spyOn(api, 'post').mockResolvedValue({ data: { before: 'before', after: 'after', mutations: [{ key: 'password', operation: 'replace' }, { key: 'api_key', operation: 'add' }], base_commit: 'abc', checksum: 'sum' } } as never)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { yaml: 'encrypted-updated', checksum: 'sum', diff_before: 'before', diff_after: 'after' } } as never)
    const store = useSecretsStore()
    const detail = { name: 'api', namespace: 'payments', git: { file_path: 'clusters/payments/api.yaml', base_commit: 'abc' } } as never
    store.currentDetail = detail
    await store.computeDiff('payments', 'api', mutations, 'abc')
    await store.applyReviewedMutation()
    // The keys travel in the body: a batch has no single key to name in a path.
    expect(patch).toHaveBeenCalledWith('/api/v1/secrets/payments/api/values', { mutations, base_commit: 'abc' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
    // Applying writes nothing, so the detail the page renders from is still
    // valid — and clearing it would take the delivery panel off the page with
    // it, leaving the operator unable to dry-run or deliver what they confirmed.
    expect(store.currentDetail).toBe(detail)
    expect(store.pendingMutation).toBeNull()
  })

  it('carries the reviewed path from the diff, not the mapping template', async () => {
    // The manifest lives in an application subdirectory, so the diff names the
    // file the tree walk found rather than the path the mapping renders.
    vi.spyOn(api, 'post').mockResolvedValue({ data: { before: 'before', after: 'after', mutations: [{ key: 'password', operation: 'replace' }], base_commit: 'abc', checksum: 'sum', target_path: 'custom/apps/secrets/api.yaml' } } as never)
    const store = useSecretsStore()
    await store.computeDiff('payments', 'api', [{ key: 'password', operation: 'replace' as const, value: 'new' }], 'abc')
    expect(store.currentDiff?.target_path).toBe('custom/apps/secrets/api.yaml')
  })

  it('applies exactly the batch that was reviewed, not the editor state at apply time', async () => {
    const reviewed = [{ key: 'password', operation: 'replace' as const, value: 'reviewed-value' }]
    vi.spyOn(api, 'post').mockResolvedValue({ data: { before: 'before', after: 'after', mutations: [{ key: 'password', operation: 'replace' }], base_commit: 'abc', checksum: 'sum' } } as never)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: { yaml: 'encrypted-updated', checksum: 'sum', diff_before: 'before', diff_after: 'after' } } as never)
    const store = useSecretsStore()
    await store.computeDiff('payments', 'api', reviewed, 'abc')

    // The caller keeps its own reference and mutates it afterwards. What was
    // reviewed is what must be applied: a diff the operator approved for one
    // value cannot be silently spent on another.
    reviewed[0].value = 'something-else'
    await store.applyReviewedMutation()
    expect(patch).toHaveBeenCalledWith('/api/v1/secrets/payments/api/values', { mutations: [{ key: 'password', operation: 'replace', value: 'reviewed-value' }], base_commit: 'abc' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
  })

  it('delivers using the server-selected mode and returns the result', async () => {
    const request = vi.spyOn(api, 'post').mockResolvedValue({ data: { mode: 'proposal', commit_sha: 'abc', proposal_url: 'https://git.example/pr/1' } } as never)
    const result = await useSecretsStore().deliver('payments', 'api', 'encrypted-yaml', 'base')
    expect(result.proposal_url).toContain('/pr/1')
    expect(request).toHaveBeenCalledWith('/api/v1/gitops/deliver', { namespace: 'payments', name: 'api', yaml: 'encrypted-yaml', base_commit: 'base' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
  })

  it('runs a server-side Git dry run before delivery', async () => {
    const dryRun = vi.spyOn(api, 'post').mockResolvedValue({ data: { before: 'git-before', after: 'git-after', path: 'clusters/prod/payments/api.yaml', base_commit: 'abc', mode: 'proposal' } } as never)
    const store = useSecretsStore()
    store.currentDiff = { before: 'encrypted-before', after: 'encrypted-after', mutations: [{ key: 'password', operation: 'replace' }], base_commit: 'abc', checksum: 'sum' }
    await store.dryRun('payments', 'api', 'encrypted-after', 'abc')
    expect(dryRun).toHaveBeenCalledWith('/api/v1/gitops/dry-run', { namespace: 'payments', name: 'api', yaml: 'encrypted-after', base_commit: 'abc' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
    expect(JSON.stringify(store.dryRunResult)).toContain('git-after')
  })

  it('syncs a drifted live secret to Git with an idempotency key', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { mode: 'direct', commit_sha: 'sha-sync', branch: 'main', file_path: 'clusters/payments/api.yaml', argocd_sync_verified: false } } as never)
    vi.spyOn(api, 'get').mockResolvedValue({ data: { name: 'api', namespace: 'payments', git: { in_sync_with_live: true, drift: 'in-sync' } } } as never)
    const store = useSecretsStore()
    const result = await store.syncToGit('payments', 'api', 'base-123')
    expect(result.commit_sha).toBe('sha-sync')
    expect(post).toHaveBeenCalledWith('/api/v1/gitops/sync', { namespace: 'payments', name: 'api', base_commit: 'base-123' }, expect.objectContaining({ 'Idempotency-Key': expect.any(String) }))
  })
})
