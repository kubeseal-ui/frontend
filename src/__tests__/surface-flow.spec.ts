// The redraw's flow spec. One button, three presses, on the edit path and the create path.
//
// The presses are driven through the store, where the sequence and its request shapes live; the
// two views are mounted for the things that exist only in markup — the destination that gets
// named, the mode switch, and the sync that is withheld when Git moved ahead.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { pinia } from '@/pinia'
import { router } from '@/router'
import { api } from '@/api'
import PendingBar from '@/components/PendingBar.vue'
import StateSpine from '@/components/StateSpine.vue'
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

// The create form over one mapping. The directory picker exists only where the mapping grants one,
// so each test states the grant it is about rather than sharing a fixture that hides it.
async function mountCreate(mapping: { path_template: string; allowed_paths: string[] }) {
  grant(['metadata:read', 'secret:seal'])
  vi.spyOn(api, 'get').mockImplementation((async (path: string) => ({
    data: path.includes('/gitops/paths')
      ? { namespaces: [{ namespace: 'payments', repository: 'r', branch: 'main', mode: 'direct', ...mapping }] }
      : {},
  })) as never)
  const wrapper = mount(NewSecretView, { props: { namespace: 'payments' }, global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

// The box opens holding the template's single empty key, which the server refuses to seal, so a
// test that reaches the press has to put a manifest in it.
async function writeManifest(wrapper: VueWrapper, name: string) {
  await wrapper.find('textarea').setValue(`apiVersion: v1\nkind: Secret\nmetadata:\n  name: ${name}\nstringData:\n  key: "value"\n`)
  await flushPromises()
}

async function pressEncrypt(wrapper: VueWrapper) {
  await wrapper.findAll('button').find((candidate) => candidate.text() === 'Encrypt for review')!.trigger('click')
  await flushPromises()
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

  // A delivery whose response never arrived retries under the key it already used. The push landed,
  // so the server replays the commit it recorded; minting a fresh key claims a new delivery and gets
  // it refused against the base that same push moved.
  it('retries a delivery under the key it already used', async () => {
    const post = posts(DIFF, CHECKED)
    vi.spyOn(api, 'patch').mockResolvedValue({ data: PATCHED } as never)
    const store = stageEdit()
    await store.reviewChange()
    await store.applyAndCheck()

    const keys: unknown[] = []
    let loseTheResponse = true
    post.mockImplementation((async (path: string, _body: unknown, headers?: HeadersInit) => {
      if (path === '/api/v1/gitops/deliver') {
        keys.push((headers as Record<string, string>)['Idempotency-Key'])
        if (loseTheResponse) { loseTheResponse = false; throw new Error('network') }
      }
      return { data: DELIVERED }
    }) as never)

    await expect(store.deliverChange()).rejects.toThrow('network')
    await store.deliverChange()

    expect(keys).toHaveLength(2)
    expect(keys[0]).toBeTruthy()
    expect(keys[1]).toBe(keys[0])
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

  // A granted directory is where a file goes, not what it is called: joining the choice to the
  // template's last segment alone would drop the identity a template like
  // `clusters/{namespace}/{name}/cred.yml` carries in a directory, and land every Secret on one file.
  it('joins a chosen directory to the template tail that names the Secret', async () => {
    const post = posts({ yaml: 'cipher-sealed', base_commit: 'def456' })
    const wrapper = await mountCreate({ path_template: 'clusters/{namespace}/{name}/cred.yml', allowed_paths: ['tools'] })

    await wrapper.find('input[aria-label="New secret name"]').setValue('api')
    await wrapper.find('select').setValue('tools')
    await flushPromises()
    expect(wrapper.text()).toContain('the file will be tools/api/cred.yml')

    await wrapper.find('input[aria-label="Further subdirectory under the chosen directory"]').setValue('prod')
    await flushPromises()
    expect(wrapper.text()).toContain('the file will be tools/prod/api/cred.yml')

    await writeManifest(wrapper, 'api')
    await pressEncrypt(wrapper)

    expect(post).toHaveBeenCalledWith('/api/v1/secrets/encrypt', expect.objectContaining({ target_path: 'tools/prod/api/cred.yml' }))
  })

  // The server writes the path it is given, so the tidying is the browser's job: what the picker
  // names is exactly what is sent.
  it('sends the path it displayed, not the spelling it was typed in', async () => {
    const post = posts({ yaml: 'cipher-sealed', base_commit: 'def456' })
    const wrapper = await mountCreate({ path_template: '{namespace}/{name}.yaml', allowed_paths: ['{namespace}', 'tools'] })

    await wrapper.find('input[aria-label="New secret name"]').setValue('api')
    await wrapper.find('select').setValue('tools')
    await wrapper.find('input[aria-label="Further subdirectory under the chosen directory"]').setValue('//prod/./')
    await flushPromises()
    expect(wrapper.text()).toContain('the file will be tools/prod/api.yaml')

    await writeManifest(wrapper, 'api')
    await pressEncrypt(wrapper)

    expect(post).toHaveBeenCalledWith('/api/v1/secrets/encrypt', expect.objectContaining({ target_path: 'tools/prod/api.yaml' }))
  })

  // The one segment no tidying can resolve: honouring it would send a path outside the directory
  // the operator just chose, which is the only thing that choice decides.
  it('refuses a subdirectory that steps outside the directory it was typed under', async () => {
    const post = posts({ yaml: 'cipher-sealed', base_commit: 'def456' })
    const wrapper = await mountCreate({ path_template: '{namespace}/{name}.yaml', allowed_paths: ['{namespace}', 'tools'] })

    await wrapper.find('input[aria-label="New secret name"]').setValue('api')
    await wrapper.find('select').setValue('tools')
    await wrapper.find('input[aria-label="Further subdirectory under the chosen directory"]').setValue('../other')
    await writeManifest(wrapper, 'api')
    await pressEncrypt(wrapper)

    expect(wrapper.text()).toContain('A subdirectory cannot step outside the directory you chose.')
    expect(post).not.toHaveBeenCalled()
  })

  // The rail is the stage made legible: it names where the operator is standing while the one
  // button at the foot only ever names the next press.
  it('shows a progress rail that moves from Compose to Review once a draft exists', async () => {
    const wrapper = await mountCreate({ path_template: '{namespace}/{name}.yaml', allowed_paths: ['{namespace}'] })
    const current = () => wrapper.find('nav[aria-label="Workflow progress"] [aria-current="step"]')
    expect(current().text()).toContain('Compose')

    useSecretsStore(pinia).change = { namespace: 'payments', name: 'api', mutations: [], baseCommit: 'c', targetPath: 'payments/api.yaml', scope: 'strict', encrypted: 'cipher' }
    await flushPromises()
    expect(current().text()).toContain('Review')
  })

  // The manifest box is the one place in the app holding a Secret in plaintext; once that Secret is
  // sealed and committed, it must not linger there.
  it('clears the typed manifest once the draft is delivered', async () => {
    const wrapper = await mountCreate({ path_template: '{namespace}/{name}.yaml', allowed_paths: ['{namespace}'] })
    await wrapper.find('textarea').setValue('apiVersion: v1\nkind: Secret\nmetadata:\n  name: api\nstringData:\n  token: "SENTINELVALUE"\n')
    await flushPromises()

    const store = useSecretsStore(pinia)
    store.check = { yaml: 'cipher-sealed', checksum: 'sum', result: CHECKED, idempotencyKey: 'k' }
    store.delivery = DELIVERED
    await flushPromises()

    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).not.toContain('SENTINELVALUE')
    // The spent diff comes off the screen and the next step rides with the confirmation, not a
    // trailing bar line below a stacked draft.
    expect(wrapper.text()).toContain('Encrypt another Secret')
    expect(wrapper.text()).not.toContain('What will be written')
    expect(wrapper.text()).not.toContain('Delivered. Encrypt another manifest')
  })

  // A new Secret has no file in Git to diff against, so a passing dry-run must say so rather than
  // only relabelling the button from Check to Deliver.
  it('confirms the dry-run passed, advancing the rail and stating the result', async () => {
    const wrapper = await mountCreate({ path_template: '{namespace}/{name}.yaml', allowed_paths: ['{namespace}'] })
    const current = () => wrapper.find('nav[aria-label="Workflow progress"] [aria-current="step"]')
    const store = useSecretsStore(pinia)
    store.change = { namespace: 'payments', name: 'api', mutations: [], baseCommit: 'c', targetPath: 'payments/api.yaml', scope: 'strict', encrypted: 'cipher' }
    await flushPromises()
    expect(current().text()).toContain('Review')
    expect(wrapper.text()).not.toContain('applies cleanly')

    store.check = { yaml: 'cipher', checksum: '', result: CHECKED, idempotencyKey: 'k' }
    await flushPromises()
    expect(current().text()).toContain('Check')
    expect(wrapper.text()).toContain('applies cleanly')
  })

  // Each result opens where it lands rather than replacing the last one, so the stage the rail
  // marks is also the region that is open. The section itself is in the document from the first
  // render — a fold cannot animate a region that arrives already open — and the press bar is not
  // one of its regions: it is sticky, and `overflow: hidden` on an ancestor is what stops a sticky
  // element sticking.
  it('opens one result region per stage, and keeps the press bar out of the folds', async () => {
    const wrapper = await mountCreate({ path_template: '{namespace}/{name}.yaml', allowed_paths: ['{namespace}'] })
    const open = () => wrapper.findAll('.fold').map((fold) => fold.classes().includes('open'))
    expect(wrapper.find('section.fold-stack').exists()).toBe(true)
    expect(open()).toEqual([false, false, false])

    const store = useSecretsStore(pinia)
    store.change = { namespace: 'payments', name: 'api', mutations: [], baseCommit: 'c', targetPath: 'payments/api.yaml', scope: 'strict', encrypted: 'cipher' }
    await flushPromises()
    expect(open()).toEqual([true, false, false])

    store.check = { yaml: 'cipher', checksum: '', result: CHECKED, idempotencyKey: 'k' }
    await flushPromises()
    expect(open()).toEqual([true, true, false])

    // A delivery spends the draft it consumed and keeps the check, which is the state the store
    // actually leaves behind; the report is the only region left open.
    store.change = null
    store.delivery = DELIVERED
    await flushPromises()
    expect(open()).toEqual([false, false, true])
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

  it('names what differs, so the operator is not left diffing both sides by hand', async () => {
    const { wrapper } = await mountSurface(detail({
      git: git({
        drift: 'diverged', in_sync_with_live: false, drift_reason: 'ciphertext',
        drift_fields: ['spec.encryptedData.password', 'spec.encryptedData.username'],
      }),
    }))
    await flushPromises()

    expect(wrapper.text()).toContain('Sealing is not deterministic')
    expect(wrapper.text()).toContain('spec.encryptedData.password, spec.encryptedData.username')
  })

  it('keeps a long field list to one line', async () => {
    const fields = Array.from({ length: 9 }, (_, index) => `spec.encryptedData.key${index}`)
    const { wrapper } = await mountSurface(detail({
      git: git({ drift: 'diverged', in_sync_with_live: false, drift_reason: 'keys', drift_fields: fields }),
    }))
    await flushPromises()

    expect(wrapper.text()).toContain('spec.encryptedData.key5 and 3 more')
    expect(wrapper.text()).not.toContain('spec.encryptedData.key6')
  })

  it('reports the status alone when the payload carries no reason', async () => {
    const { wrapper } = await mountSurface(detail({ git: git({ drift: 'diverged', in_sync_with_live: false }) }))
    await flushPromises()

    expect(wrapper.text()).toContain('Status: Diverged')
    expect(wrapper.text()).not.toContain('Sealing is not deterministic')
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
    expect(modeButton('Keys').attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain('Copy YAML')
    expect(refetches()).toBe(reads)
  })

  it('keeps a staged draft when the mode flips to YAML and back', async () => {
    const { wrapper } = await mountSurface(detail())
    await flushPromises()
    const modeButton = (label: string) => wrapper.findAll('button').find((candidate) => candidate.text() === label)!

    await wrapper.findAll('button').find((candidate) => candidate.text() === 'Change')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    await flushPromises()
    expect(wrapper.text()).toContain('1 change staged')

    // Both editors stay mounted, so the round trip to YAML and back must not throw the draft away.
    await modeButton('YAML').trigger('click')
    await flushPromises()
    await modeButton('Keys').trigger('click')
    await flushPromises()

    expect((wrapper.find('input[aria-label="Replacement value for password"]').element as HTMLInputElement).value).toBe('rotated')
    expect(wrapper.text()).toContain('1 change staged')
  })

  it('steps back from a review with Start over, keeping the staged row', async () => {
    posts(DIFF)
    const { wrapper } = await mountSurface(detail())
    await flushPromises()

    await wrapper.findAll('button').find((candidate) => candidate.text() === 'Change')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    await flushPromises()
    await wrapper.findAll('button').find((candidate) => candidate.text().includes('Review change'))!.trigger('click')
    await flushPromises()

    const store = useSecretsStore(pinia)
    expect(store.review).not.toBeNull()

    await wrapper.findAll('button').find((candidate) => candidate.text() === 'Start over')!.trigger('click')
    await flushPromises()

    // The review is dropped and the forward press returns to the first step, with the row still staged.
    expect(store.review).toBeNull()
    expect(wrapper.findAll('button').map((candidate) => candidate.text())).toContain('Review change')
    expect((wrapper.find('input[aria-label="Replacement value for password"]').element as HTMLInputElement).value).toBe('rotated')
  })

  it('drops a stale review when a row is edited after reviewing', async () => {
    posts(DIFF)
    const { wrapper } = await mountSurface(detail())
    await flushPromises()

    await wrapper.findAll('button').find((candidate) => candidate.text() === 'Change')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    await flushPromises()
    await wrapper.findAll('button').find((candidate) => candidate.text().includes('Review change'))!.trigger('click')
    await flushPromises()

    const store = useSecretsStore(pinia)
    expect(store.review).not.toBeNull()

    // Editing after the review makes it stale, so it is dropped rather than left showing a diff of a
    // batch the rows no longer match.
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated-again')
    await flushPromises()
    expect(store.review).toBeNull()
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

  it('stops offering the press once the change has landed, and says what comes next', async () => {
    const { wrapper } = await mountSurface(detail())
    await flushPromises()

    // A change is staged first, because an empty one has no press to lose: the bar already states
    // that instead of offering a button, which the test below pins on its own.
    await wrapper.findAll('button').find((candidate) => candidate.text() === 'Change')!.trigger('click')
    await flushPromises()
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    await flushPromises()
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Review change')

    useSecretsStore(pinia).delivery = DELIVERED
    await flushPromises()

    // A landed delivery is terminal: the store dropped the change it consumed, so a press here
    // would re-post the same base commit into a conflict. The spent bar is gone, and the next step
    // rides with the confirmation instead.
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Review change')
    expect(wrapper.text()).toContain('Edit this Secret again')
    // The report still names where it went.
    expect(wrapper.text()).toContain('Delivered directly')
  })

  it('says there is nothing staged rather than offering a dead button', async () => {
    const { wrapper } = await mountSurface(detail())
    await flushPromises()

    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Review change')
    expect(wrapper.text()).toContain('Nothing staged. Reveal, change, or remove a key to begin.')
  })

  // Drift takes the screen: there is no workflow to be partway through, so the rail yields to the
  // alert that explains why editing is disabled.
  it('shows the workflow rail only while the Secret is in sync', async () => {
    const { wrapper } = await mountSurface(detail())
    await flushPromises()
    expect(wrapper.find('nav[aria-label="Workflow progress"]').exists()).toBe(true)

    useSecretsStore(pinia).currentDetail = detail({ git: git({ drift: 'diverged', in_sync_with_live: false }) })
    await flushPromises()
    expect(wrapper.find('nav[aria-label="Workflow progress"]').exists()).toBe(false)
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
    store.check = { yaml: 'cipher-sealed', checksum: 'sum-check', result: CHECKED, idempotencyKey: 'check-key' }
    store.delivery = DELIVERED
    await flushPromises()

    // A create that delivered and said nothing left a spent draft on screen with no record of
    // where it went.
    expect(wrapper.text()).toContain('Delivered directly')
  })
})

describe('the one button', () => {
  type BarProps = { step: 'review' | 'apply-check' | 'check' | 'deliver'; mode: 'direct' | 'proposal' | ''; count: number; ready: boolean; busy: boolean }

  // Test Utils stubs `transition` by default: the pair becomes a `<transition-stub>` element
  // that runs no enter hooks, so the label's roll would be unobservable and the label would no
  // longer be the button's own child. This file is about the real component, so it renders.
  function bar(props: Partial<BarProps> = {}) {
    return mount(PendingBar, {
      props: { step: 'review', mode: 'direct', count: 1, ready: true, busy: false, ...props },
      global: { plugins: [pinia], stubs: { transition: false } },
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

  it('keeps its first label still, and rolls only when the step moves on', () => {
    const wrapper = bar({ step: 'review' })

    // The roll is a transition over the keyed label rather than an entrance: nothing on this
    // screen moves until someone presses something, and the bar is no exception — so at mount
    // the label wears neither half of the pair, as the button's own child.
    const labels = wrapper.findAll('span').filter((span) => span.text() === 'Review change')
    expect(labels).toHaveLength(1)
    expect(labels[0]!.element.parentElement?.tagName).toBe('BUTTON')
    expect(labels[0]!.classes()).not.toContain('roll-next')
    expect(labels[0]!.classes()).not.toContain('roll-out')
  })
})

describe('the spine', () => {
  it('answers what the change is against and what the screen can do, without repeating the rail', () => {
    const store = useSecretsStore(pinia)
    // Nothing staged: the panel offers what this screen can do, not a copy of the rail's stages.
    const idle = mount(StateSpine, {
      props: { detail: detail(), staged: 0, baseCommit: 'abc123', canSeal: true, canReveal: true, canDeliver: true, canSync: false },
      global: { plugins: [pinia] },
    })
    expect(idle.text()).not.toContain('This change')
    expect(idle.text()).toContain('Here you can')

    // A change in flight: the panel names what it is against instead.
    store.review = DIFF as never
    const live = mount(StateSpine, {
      props: { detail: detail(), staged: 1, baseCommit: 'abc123', canSeal: true, canReveal: true, canDeliver: true, canSync: false },
      global: { plugins: [pinia] },
    })
    expect(live.text()).toContain('Against')
    expect(live.text()).toContain('abc123')
  })
})
