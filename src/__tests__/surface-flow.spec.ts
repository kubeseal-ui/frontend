// The redraw's flow spec. One button, three presses, on the edit path and the create path.
//
// The presses are driven through the store, where the sequence and its request shapes live; the
// two views are mounted for the things that exist only in markup — the destination that gets
// named, the mode switch, and the sync that is withheld when Git moved ahead.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { pinia } from '@/pinia'
import { router } from '@/router'
import { api } from '@/api'
import PendingBar from '@/components/PendingBar.vue'
import NewSecretView from '@/views/NewSecretView.vue'
import SecretSurface from '@/views/SecretSurface.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { Capability, GitState, Mutation, SealedSecretDetail } from '@/types'

const IDEMPOTENT = { 'Idempotency-Key': expect.any(String) }

// A fresh batch each time: one test mutates the array it staged, and a shared literal would
// leak that into the next.
function editorBatch(): Mutation[] {
  return [
    { key: 'password', operation: 'replace', value: 'new-password' },
    { key: 'api_key', operation: 'add', value: 'brand-new' },
  ]
}

const DIFF = {
  before: 'cipher-before',
  after: 'cipher-prediction',
  mutations: [{ key: 'password', operation: 'replace' }, { key: 'api_key', operation: 'add' }],
  base_commit: 'abc123',
  checksum: 'sum-review',
}
const PATCHED = { yaml: 'cipher-patched', checksum: 'sum-patch' }
// The dry run resolves a destination the mapping template never named. A delivery that echoed
// the template instead of this would write to the wrong file.
const CHECKED = { before: 'git-before', after: 'git-after', path: 'custom/apps/secrets/api.yaml', base_commit: 'abc123', mode: 'direct' as const }
const DELIVERED = { mode: 'direct' as const, commit_sha: 'sha-1', branch: 'main', file_path: 'custom/apps/secrets/api.yaml', argocd_sync_verified: false as const }

function git(overrides: Partial<GitState> = {}): GitState {
  return {
    managed: true, in_sync_with_live: true, drift: 'in-sync',
    base_commit: 'abc123', file_path: 'clusters/payments/api.yaml', branch: 'main', delivery_mode: 'direct',
    ...overrides,
  }
}

function detail(overrides: Partial<SealedSecretDetail> = {}): SealedSecretDetail {
  return {
    name: 'api', namespace: 'payments', key_count: 2, keys: ['password', 'api_key'], scope: 'strict',
    created_at: '2026-09-01T00:00:00Z',
    sealed_secret_yaml: 'apiVersion: bitnami.com/v1alpha1\nkind: SealedSecret\n',
    git: git(),
    ...overrides,
  }
}

function grant(grants: Capability[]) {
  useAuthStore(pinia).setSession({ email: 'operator@example.com', name: 'Operator', username: 'operator', namespaces: { payments: grants } })
}

// Bodies are handed back in call order, so a test reads as the sequence of presses rather than
// as a URL-to-response table.
function posts(...bodies: unknown[]) {
  const queue = [...bodies]
  return vi.spyOn(api, 'post').mockImplementation((async () => ({ data: queue.shift() })) as never)
}

function stageEdit(store = useSecretsStore(pinia), mutations = editorBatch()) {
  store.stageChange({ namespace: 'payments', name: 'api', mutations, baseCommit: 'abc123', targetPath: 'clusters/payments/api.yaml', scope: 'strict' })
  return store
}

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  useAuthStore(pinia).clearSession()
  document.body.innerHTML = ''
})

describe('the edit path', () => {
  it('reviews the staged batch on the first press', async () => {
    const post = posts(DIFF)
    await stageEdit().reviewChange()
    expect(post).toHaveBeenCalledWith('/api/v1/secrets/payments/api/diff', { mutations: editorBatch(), base_commit: 'abc123' }, IDEMPOTENT)
    // One diff for the whole batch. If this ever becomes N calls the feature has silently reverted
    // to one key per round trip while still looking like a batch.
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('checks the ciphertext the patch built, not the review prediction', async () => {
    const post = posts(DIFF, CHECKED)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: PATCHED } as never)
    const store = stageEdit()
    await store.reviewChange()
    await store.applyAndCheck()

    expect(patch).toHaveBeenCalledWith('/api/v1/secrets/payments/api/values', { mutations: editorBatch(), base_commit: 'abc123' }, IDEMPOTENT)
    expect(patch).toHaveBeenCalledTimes(1)
    expect(post).toHaveBeenLastCalledWith('/api/v1/gitops/dry-run', {
      namespace: 'payments', name: 'api', yaml: 'cipher-patched', base_commit: 'abc123', target_path: 'clusters/payments/api.yaml',
    }, IDEMPOTENT)
    // Re-encryption is not deterministic, so the prediction describes bytes the server never
    // built. Checking it would clear the change against a document that does not exist.
    expect(store.check?.yaml).toBe('cipher-patched')
  })

  it('sends the batch that was reviewed, not the rows it was staged from', async () => {
    posts(DIFF, CHECKED)
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: PATCHED } as never)
    const held = editorBatch()
    const store = stageEdit(useSecretsStore(pinia), held)
    await store.reviewChange()

    // The editor keeps its own array and goes on editing it after the review. A change approved
    // for one set of values must not be spent on another.
    held[0].value = 'typed-later'
    held.push({ key: 'unreviewed', operation: 'add', value: 'x' })
    await store.applyAndCheck()

    expect(patch).toHaveBeenCalledWith('/api/v1/secrets/payments/api/values', { mutations: editorBatch(), base_commit: 'abc123' }, IDEMPOTENT)
  })

  it('delivers to the file the check resolved, not the mapping template', async () => {
    const post = posts(DIFF, CHECKED, DELIVERED)
    vi.spyOn(api, 'patch').mockResolvedValue({ data: PATCHED } as never)
    const store = stageEdit()
    await store.reviewChange()
    await store.applyAndCheck()
    const result = await store.deliverChange()

    expect(post).toHaveBeenLastCalledWith('/api/v1/gitops/deliver', {
      namespace: 'payments', name: 'api', yaml: 'cipher-patched', base_commit: 'abc123', target_path: 'custom/apps/secrets/api.yaml',
    }, IDEMPOTENT)
    expect(result.commit_sha).toBe('sha-1')
    expect(store.delivery).toEqual(DELIVERED)
  })

  it('pushes a drifted Secret to Git with an idempotency key and re-reads it after', async () => {
    const post = posts({ ...DELIVERED, mode: 'direct' })
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: detail() } as never)
    const store = useSecretsStore(pinia)

    await store.syncToGit('payments', 'api', 'abc123')

    expect(post).toHaveBeenCalledWith('/api/v1/gitops/sync', { namespace: 'payments', name: 'api', base_commit: 'abc123' }, IDEMPOTENT)
    expect(get).toHaveBeenCalledWith('/api/v1/secrets/payments/api')
  })
})

describe('the create path', () => {
  it('seals the manifest, checks the ciphertext the server returned, then delivers it', async () => {
    const post = posts(
      { yaml: 'cipher-sealed', base_commit: 'def456', target_path: 'clusters/payments/new.yaml' },
      CHECKED,
      DELIVERED,
    )
    const store = useSecretsStore(pinia)

    await store.encryptDraft('payments', 'new', 'apiVersion: v1\nkind: Secret\n', 'strict')
    // No idempotency key: encrypt persists nothing, so there is no effect for a repeat to duplicate.
    expect(post).toHaveBeenNthCalledWith(1, '/api/v1/secrets/encrypt', {
      namespace: 'payments', name: 'new', yaml: 'apiVersion: v1\nkind: Secret\n', scope: 'strict', target_path: undefined,
    })
    // Nothing to diff: the manifest had no SealedSecret before this press.
    expect(store.review).toBeNull()
    // The server's base commit wins; the caller had none to offer.
    expect(store.change?.baseCommit).toBe('def456')

    await store.checkDraft()
    expect(post).toHaveBeenNthCalledWith(2, '/api/v1/gitops/dry-run', {
      namespace: 'payments', name: 'new', yaml: 'cipher-sealed', base_commit: 'def456', target_path: 'clusters/payments/new.yaml',
    }, IDEMPOTENT)

    await store.deliverChange()
    expect(post).toHaveBeenNthCalledWith(3, '/api/v1/gitops/deliver', expect.objectContaining({
      yaml: 'cipher-sealed', base_commit: 'abc123', target_path: 'custom/apps/secrets/api.yaml',
    }), IDEMPOTENT)
  })

  it('refuses the form without the seal capability', async () => {
    grant(['metadata:read'])
    vi.spyOn(api, 'get').mockResolvedValue({ data: { namespaces: [] } } as never)
    const wrapper = mount(NewSecretView, { props: { namespace: 'payments' }, global: { plugins: [pinia, router] } })
    await flushPromises()
    expect(wrapper.text()).toContain('Access denied')
  })

  it('states the delivery mode and target directory before a manifest is written', async () => {
    grant(['metadata:read', 'secret:seal'])
    vi.spyOn(api, 'get').mockImplementation((async (path: string) => ({
      data: path.includes('/gitops/paths')
        ? { namespaces: [{ namespace: 'payments', path_template: 'clusters/{namespace}/{name}.yaml', allowed_paths: ['clusters/{namespace}'], repository: 'r', branch: 'main', mode: 'direct' }] }
        : {},
    })) as never)

    const wrapper = mount(NewSecretView, { props: { namespace: 'payments' }, global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.text()).not.toContain('Access denied')
    expect(wrapper.text()).toContain('direct')
    // The mapping's directory, rendered per namespace, marked as where a Secret lands by default.
    expect(wrapper.text()).toContain('clusters/payments')
    expect(wrapper.text()).toContain('default')
  })
})

describe('the surface', () => {
  function mountSurface(secret: SealedSecretDetail, grants: Capability[] = ['metadata:read', 'secret:seal', 'secret:decrypt', 'gitops:push']) {
    grant(grants)
    const get = vi.spyOn(api, 'get').mockImplementation((async (path: string) => ({
      data: path.includes('/gitops/paths')
        ? { namespaces: [{ namespace: 'payments', path_template: 'clusters/{namespace}/{name}.yaml', allowed_paths: [], repository: 'r', branch: 'main', mode: 'direct' }] }
        : secret,
    })) as never)
    return router.push('/secrets/payments/api').then(() => ({
      wrapper: mount(SecretSurface, { global: { plugins: [pinia, router] } }),
      get,
    }))
  }

  it('offers Sync anyway when Git moved past the cluster, and says what pressing it discards', async () => {
    const { wrapper } = await mountSurface(detail({ git: git({ drift: 'diverged', git_moved_ahead: true }) }))
    await flushPromises()

    expect(wrapper.text()).toContain('Git holds a change this Secret predates')
    expect(wrapper.text()).toContain('Syncing would overwrite that change')
    const labels = wrapper.findAll('button').map((button) => button.text())
    expect(labels).toContain('Sync anyway')
    expect(labels).not.toContain('Sync Live Secret to Git')
  })

  it('offers the ordinary sync when the file simply changed on the cluster side', async () => {
    const { wrapper } = await mountSurface(detail({ git: git({ drift: 'live_only' }) }))
    await flushPromises()
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Sync Live Secret to Git')
  })

  it('switches the document between rows and YAML without refetching the Secret', async () => {
    const { wrapper, get } = await mountSurface(detail())
    await flushPromises()
    const refetches = () => get.mock.calls.filter(([path]) => path === '/api/v1/secrets/payments/api').length
    const reads = refetches()

    // Re-queried after the press rather than held across it: the mode drives both the classes and
    // the pressed state, so the read follows the live node instead of one captured before it.
    const modeButton = (label: string) => wrapper.findAll('button').find((candidate) => candidate.text() === label)!
    await modeButton('YAML').trigger('click')
    await flushPromises()

    // The mode is a query parameter, so a reload lands where the operator was...
    expect(router.currentRoute.value.query.mode).toBe('yaml')
    // ...and both buttons announce which one is pressed rather than showing it in colour alone.
    expect(modeButton('YAML').attributes('aria-pressed')).toBe('true')
    expect(modeButton('Key rows').attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain('Copy YAML')
    expect(refetches()).toBe(reads)
  })

  it('withholds editing and says so when the Git source is not in sync', async () => {
    const { wrapper } = await mountSurface(detail({ git: git({ drift: 'unknown', in_sync_with_live: false }) }))
    await flushPromises()
    expect(wrapper.text()).toContain('Reveal, editing, and delivery are disabled')
  })

  it('withholds the press over a batch staged before drift arrived', async () => {
    const { wrapper } = await mountSurface(detail())
    await flushPromises()
    const press = () => wrapper.findAll('button').find((candidate) => candidate.text().includes('Review change'))!

    await wrapper.findAll('button').find((candidate) => candidate.text() === 'Change')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    await flushPromises()
    expect(press().attributes('disabled')).toBeUndefined()

    // The Secret is reloaded under a row that is still open. The editor keeps its `editing` map
    // across the prop change, so the batch survives even where the new detail forbids it — the
    // surface's own gate is what has to hold, not the editor's willingness to produce a batch.
    useSecretsStore(pinia).currentDetail = detail({ git: git({ drift: 'diverged', in_sync_with_live: false }) })
    await flushPromises()
    expect(press().attributes('disabled')).toBeDefined()
  })

  it('stops offering the press once the change has landed, and says why', async () => {
    const { wrapper } = await mountSurface(detail())
    await flushPromises()
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Review change')

    useSecretsStore(pinia).delivery = DELIVERED
    await flushPromises()

    // A landed delivery is terminal: the store dropped the change it consumed, so a press here
    // would re-post the same base commit into a conflict. The bar states that instead of
    // offering a button the server would refuse.
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Review change')
    expect(wrapper.text()).toContain('Delivered. Change another key to run the workflow again.')
    // The report still names where it went.
    expect(wrapper.text()).toContain('Delivered directly')
  })

  it('says there is nothing staged rather than offering a dead button', async () => {
    const { wrapper } = await mountSurface(detail())
    await flushPromises()

    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Review change')
    expect(wrapper.text()).toContain('Nothing staged. Change, remove, or add a key to begin.')
  })
})

describe('once the change has landed', () => {
  it('spends the change and the review it delivered, and keeps the bytes it wrote', async () => {
    posts(DIFF, CHECKED, DELIVERED)
    vi.spyOn(api, 'patch').mockResolvedValue({ data: PATCHED } as never)
    const store = stageEdit()
    await store.reviewChange()
    await store.applyAndCheck()
    await store.deliverChange()

    // The batch is in Git and the review is a different encryption of the same values, so
    // re-offering either would stage a change that has already landed.
    expect(store.change).toBeNull()
    expect(store.review).toBeNull()
    // The check stays: it is the ciphertext that was written, and the report reads its path.
    expect(store.check?.result.path).toBe('custom/apps/secrets/api.yaml')
    await expect(store.deliverChange()).rejects.toThrow('Nothing checked to deliver')
  })

  it('reports the delivery on the create path, which has no Secret page to land on', async () => {
    grant(['metadata:read', 'secret:seal', 'gitops:push'])
    vi.spyOn(api, 'get').mockImplementation((async (path: string) => ({
      data: path.includes('/gitops/paths') ? { namespaces: [] } : {},
    })) as never)

    const wrapper = mount(NewSecretView, { props: { namespace: 'payments' }, global: { plugins: [pinia, router] } })
    await flushPromises()

    // A create delivers only ciphertext it has already checked, so the reachable state holds both.
    const store = useSecretsStore(pinia)
    store.check = { yaml: 'cipher-sealed', checksum: 'sum-check', result: CHECKED }
    store.delivery = DELIVERED
    await flushPromises()

    // A create that delivered and said nothing left a spent draft on screen with no record of
    // where it went.
    expect(wrapper.text()).toContain('Delivered directly')
  })
})

describe('the one button', () => {
  type BarProps = { step: 'review' | 'apply-check' | 'check' | 'deliver'; mode: 'direct' | 'proposal' | ''; count: number; ready: boolean; busy: boolean }

  function bar(props: Partial<BarProps> = {}) {
    return mount(PendingBar, {
      props: { step: 'review', mode: 'direct', count: 1, ready: true, busy: false, ...props },
      global: { plugins: [pinia] },
    })
  }

  it('names the next press, not the workflow', () => {
    expect(bar({ step: 'review' }).text()).toContain('Review change')
    expect(bar({ step: 'apply-check' }).text()).toContain('Apply & check')
    expect(bar({ step: 'check' }).text()).toContain('Check against branch')
    expect(bar({ step: 'deliver' }).text()).toContain('Deliver to Git')
  })

  it('proposes instead of pushing where the namespace proposes', () => {
    expect(bar({ step: 'deliver', mode: 'proposal' }).text()).toContain('Create proposal')
  })

  it('counts the batch in words that agree with it', () => {
    expect(bar({ count: 1 }).text()).toContain('1 change')
    expect(bar({ count: 3 }).text()).toContain('3 changes')
  })

  it('is disabled until the press would be allowed', () => {
    expect(bar({ ready: false }).find('button').attributes('disabled')).toBeDefined()
    expect(bar({ ready: true }).find('button').attributes('disabled')).toBeUndefined()
  })
})
