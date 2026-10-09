// Keyboard reachability, accessible names, masked-by-default values, capability gating, the
// staged-changes panel, the dry-run gate, and the shared review/delivery state.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import SecretKeyEditor from '@/components/SecretKeyEditor.vue'
import SecretNameEditor from '@/components/SecretNameEditor.vue'
import DeliveryPanel from '@/components/DeliveryPanel.vue'
import type { Capability, SealedSecretDetail } from '@/types'

function makeDetail(overrides: Partial<SealedSecretDetail> = {}): SealedSecretDetail {
  return {
    name: 'api',
    namespace: 'payments',
    keys: ['password', 'username'],
    key_count: 2,
    scope: 'strict',
    created_at: '2026-09-01T00:00:00Z',
    git: {
      managed: true,
      in_sync_with_live: true,
      drift: 'in-sync',
      base_commit: 'abc123',
      file_path: 'clusters/prod/payments/api.yaml',
      delivery_mode: 'direct',
    },
    ...overrides,
  }
}

function grant(pinia: Pinia, namespace: string, capabilities: Capability[]) {
  useAuthStore(pinia).setSession({ email: 'u@example.com', name: 'User', username: 'u', namespaces: { [namespace]: capabilities } })
}

function reviewedDiff(mutations = [{ key: 'password', operation: 'replace' as const }]) {
  return { before: 'encrypted-before', after: 'encrypted-after', mutations, base_commit: 'abc123', checksum: 'sum' }
}

let pinia: Pinia
beforeEach(() => {
  pinia = createPinia()
  setActivePinia(pinia)
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

function mountEditor(detail: SealedSecretDetail) {
  return mount(SecretKeyEditor, { props: { detail }, attachTo: document.body, global: { plugins: [pinia] } })
}

function mountPanel(detail: SealedSecretDetail) {
  return mount(DeliveryPanel, { props: { detail }, global: { plugins: [pinia] } })
}

function findButton(wrapper: ReturnType<typeof mountEditor> | ReturnType<typeof mountPanel>, label: string) {
  return wrapper.findAll('button').find((button) => button.text() === label)
}

/** A rail row's header, by its title. Only a row the flow has reached carries `aria-expanded`. */
function railRow(wrapper: VueWrapper, title: string) {
  return wrapper.findAll('button')
    .filter((button) => button.attributes('aria-expanded') !== undefined)
    .find((button) => button.text().startsWith(title))
}

/**
 * The inventory's keys. The tray's rows name their key as well, so a plain
 * `findAll('code')` counts a staged key as though it had joined the list — which is the
 * one thing these assertions exist to rule out. The tray is a `ul` of `li` rows; the
 * inventory is not.
 */
function inventoryKeys(wrapper: ReturnType<typeof mountEditor>) {
  return wrapper.findAll('code')
    .filter((node) => !node.element.closest('li'))
    .map((node) => node.text())
}

describe('secret key editor accessibility', () => {
  it('conceals every value until one key is revealed', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const reveal = vi.spyOn(useSecretsStore(pinia), 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const wrapper = mountEditor(makeDetail())

    expect(wrapper.findAll('input[type="password"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('concealed')

    await findButton(wrapper, 'Reveal one key')!.trigger('click')
    await flushPromises()

    expect(reveal).toHaveBeenCalledWith('payments', 'api', 'password', 'abc123')
    const masked = wrapper.findAll('input[type="password"]')
    expect(masked.length).toBeGreaterThan(0)
    expect((masked[0].element as HTMLInputElement).value).toBe('plain-secret')
    expect((masked[0].element as HTMLInputElement).type).toBe('password')
    expect(wrapper.text()).not.toContain('plain-secret')
  })

  it('renders no reveal or edit control without secret:decrypt', () => {
    grant(pinia, 'payments', ['metadata:read'])
    const wrapper = mountEditor(makeDetail())

    expect(findButton(wrapper, 'Reveal one key')).toBeFalsy()
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.text()).toContain('Values concealed')
  })

  it('explains drift and keeps the review control disabled', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const wrapper = mountEditor(makeDetail({ git: { ...makeDetail().git, in_sync_with_live: false, drift: 'diverged' } }))

    expect(wrapper.text()).toContain('Editing disabled')
    await findButton(wrapper, 'Change')!.trigger('click')

    const review = wrapper.findAll('button').find((button) => button.text().includes('Review encrypted diff'))
    expect(review?.attributes('disabled')).toBeDefined()
  })

  it('stages nothing when a key is revealed to look at it', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    vi.spyOn(useSecretsStore(pinia), 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const wrapper = mountEditor(makeDetail())

    await findButton(wrapper, 'Reveal one key')!.trigger('click')
    await flushPromises()

    // A look is not a change: the revealed value is on screen, nothing is staged, and a
    // key read on the way past cannot hold the review closed.
    expect(wrapper.find('input[aria-label="Revealed value for password"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Nothing staged.')
    expect(findButton(wrapper, 'Review encrypted diff')).toBeFalsy()

    // Conceal drops the value again and leaves the row as it was.
    await findButton(wrapper, 'Conceal')!.trigger('click')
    expect(wrapper.find('input[aria-label="Revealed value for password"]').exists()).toBe(false)
    expect(findButton(wrapper, 'Reveal one key')).toBeTruthy()
  })

  it('reviews the selected operation from keyboard-operable controls', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const store = useSecretsStore(pinia)
    const computeDiff = vi.spyOn(store, 'computeDiff').mockResolvedValue(reviewedDiff())
    const wrapper = mountEditor(makeDetail())
    await findButton(wrapper, 'Change')!.trigger('click')

    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    const remove = wrapper.findAll('input[type="radio"]').find((radio) => (radio.element as HTMLInputElement).value === 'delete')
    expect(remove).toBeDefined()
    await remove!.setValue()
    await findButton(wrapper, 'Review encrypted diff')!.trigger('click')
    await flushPromises()

    expect(computeDiff).toHaveBeenCalledWith('payments', 'api', [{ key: 'password', operation: 'delete', value: '' }], 'abc123')
    expect(wrapper.text()).toContain('Encrypted diff is ready for review.')
  })

  it('submits every staged change as one batch', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const store = useSecretsStore(pinia)
    const computeDiff = vi.spyOn(store, 'computeDiff').mockResolvedValue(reviewedDiff())
    const wrapper = mountEditor(makeDetail())

    // A replacement, staged without ever revealing the key it replaces.
    await findButton(wrapper, 'Change')!.trigger('click')
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')

    // A deletion staged without a reveal; the radios are addressed by the per-row
    // group name.
    await findButton(wrapper, 'Change')!.trigger('click')
    await wrapper.find('input[name="operation-username"][value="delete"]').setValue()

    // A brand new key.
    await findButton(wrapper, 'Add key')!.trigger('click')
    await wrapper.find('input[aria-label="New key name 1"]').setValue('api_key')
    await wrapper.find('input[aria-label="New key value 1"]').setValue('brand-new')

    await findButton(wrapper, 'Review encrypted diff')!.trigger('click')
    await flushPromises()

    // One batch, one round trip: three keys changed, one diff computed.
    expect(computeDiff).toHaveBeenCalledTimes(1)
    expect(computeDiff).toHaveBeenCalledWith('payments', 'api', [
      { key: 'password', operation: 'replace', value: 'rotated' },
      { key: 'username', operation: 'delete', value: '' },
      { key: 'api_key', operation: 'add', value: 'brand-new' },
    ], 'abc123')
  })

  it('answers an incomplete batch when review is pressed', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const store = useSecretsStore(pinia)
    const computeDiff = vi.spyOn(store, 'computeDiff').mockResolvedValue(reviewedDiff())
    const wrapper = mountEditor(makeDetail())

    // Offered as soon as there is a batch. An incomplete one is answered by pressing the
    // control, not by a control greyed out with a sentence beside it explaining why.
    await findButton(wrapper, 'Change')!.trigger('click')
    const review = findButton(wrapper, 'Review encrypted diff')!
    expect(review.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('This change needs a value.')

    // Pressing it asks the row what it is missing and puts the cursor in the field to fix,
    // so the answer arrives where the operator already is. Nothing reaches the server.
    await review.trigger('click')
    await flushPromises()
    expect(computeDiff).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('This change needs a value.')
    const replacement = wrapper.find('input[aria-label="Replacement value for password"]')
    expect(document.activeElement).toBe(replacement.element)

    // Filled, the row stops asking.
    await replacement.setValue('rotated')
    expect(wrapper.text()).not.toContain('This change needs a value.')

    // A new key colliding with an existing one is answered the same way, by the row that
    // holds it: the sentence names the key, so it never has to be matched to a row by eye.
    await findButton(wrapper, 'Add key')!.trigger('click')
    await wrapper.find('input[aria-label="New key name 1"]').setValue('username')
    await wrapper.find('input[aria-label="New key value 1"]').setValue('clash')
    await findButton(wrapper, 'Review encrypted diff')!.trigger('click')
    await flushPromises()
    expect(computeDiff).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('This Secret already has a key named username.')

    // Renamed to something free, the same press submits the whole batch.
    await wrapper.find('input[aria-label="New key name 1"]').setValue('api_key')
    await findButton(wrapper, 'Review encrypted diff')!.trigger('click')
    await flushPromises()
    expect(computeDiff).toHaveBeenCalledTimes(1)
  })

  it('stages a new key in the tray, and the row answers once it is left', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const wrapper = mountEditor(makeDetail())

    // The tray is on screen with nothing staged, so its absence never has to be read
    // as an empty stage.
    expect(wrapper.text()).toContain('Nothing staged.')

    await findButton(wrapper, 'Add key')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('1 staged change')
    // The inventory still lists exactly the Secret's keys: the new key is a tray row,
    // so staging it cannot rearrange the keys above it.
    expect(inventoryKeys(wrapper)).toEqual(['password', 'username'])

    // The row takes focus and asks for nothing yet: a field that turns red the moment it
    // appears reads as a fault rather than a prompt.
    const name = wrapper.find('input[aria-label="New key name 1"]')
    const value = wrapper.find('input[aria-label="New key value 1"]')
    expect(document.activeElement).toBe(name.element)
    expect(name.attributes('aria-invalid')).toBeUndefined()
    expect(wrapper.text()).not.toContain('This new key needs a name.')

    // Leaving the row is what makes it answer, under the field it is about.
    await wrapper.find('li').trigger('focusout')
    expect(name.attributes('aria-invalid')).toBe('true')
    expect(wrapper.text()).toContain('This new key needs a name.')

    await name.setValue('password')
    expect(wrapper.text()).toContain('This Secret already has a key named password.')

    await name.setValue('api_key')
    expect(name.attributes('aria-invalid')).toBeUndefined()
    expect(wrapper.text()).toContain('This new key needs a value.')

    await value.setValue('brand-new')
    expect(wrapper.text()).not.toContain('This new key needs a value.')
    expect(findButton(wrapper, 'Review encrypted diff')!.attributes('disabled')).toBeUndefined()
  })

  it('discards one staged change without touching the keys around it', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const wrapper = mountEditor(makeDetail())

    await findButton(wrapper, 'Change')!.trigger('click')
    expect(wrapper.text()).toContain('1 staged change')
    // The inventory still lists exactly the Secret's keys: staging is a row in the panel,
    // not a key that joins the list.
    expect(inventoryKeys(wrapper)).toEqual(['password', 'username'])

    // Discarding returns the row to plain inventory: concealed again, with the controls a
    // key that is not being touched carries.
    await findButton(wrapper, 'Discard')!.trigger('click')
    expect(wrapper.text()).toContain('Nothing staged.')
    expect(findButton(wrapper, 'Reveal one key')).toBeTruthy()
  })

  it('names every control, keeps disabled actions out of the tab order, and focuses what is enabled', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    vi.spyOn(useSecretsStore(pinia), 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const wrapper = mountEditor(makeDetail())
    await findButton(wrapper, 'Reveal one key')!.trigger('click')
    await flushPromises()
    await findButton(wrapper, 'Change')!.trigger('click')
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')

    const controls = wrapper.findAll('button, input, textarea')
    expect(controls.length).toBeGreaterThan(2)
    for (const control of controls) {
      const element = control.element as HTMLInputElement
      const name = element.getAttribute('aria-label') || element.closest('label')?.textContent?.trim() || element.textContent?.trim()
      expect(name, `${element.outerHTML} needs an accessible name`).toBeTruthy()
      expect(Number(element.getAttribute('tabindex') ?? 0)).toBeLessThanOrEqual(0)
    }

    const enabled = controls.filter((control) => !(control.element as HTMLInputElement).disabled)
    expect(enabled.length).toBeGreaterThan(0)
    for (const control of enabled) {
      const element = control.element as HTMLInputElement
      element.focus()
      expect(document.activeElement).toBe(element)
    }
  })

  it('folds the editor once a review exists, and Edit brings it back', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const store = useSecretsStore(pinia)
    const wrapper = mountEditor(makeDetail())

    // Nothing reviewed yet: the form is the page, so there is no fold and no toggle.
    expect(findButton(wrapper, 'Edit')).toBeFalsy()

    store.currentDiff = reviewedDiff()
    await flushPromises()

    // Folded to a line saying what was reviewed, with the way back in. Folding discards
    // nothing: the inventory and the tray are behind the toggle, not gone.
    expect(wrapper.text()).toContain('1 change reviewed')
    expect(wrapper.text()).toContain('Reveal one key')
    expect(wrapper.text()).toContain('Staged changes')

    await findButton(wrapper, 'Edit')!.trigger('click')
    expect(findButton(wrapper, 'Hide')).toBeTruthy()
    expect(findButton(wrapper, 'Edit')).toBeFalsy()
  })

  it('drops the staged set once a delivery has consumed it', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const store = useSecretsStore(pinia)
    vi.spyOn(store, 'computeDiff').mockResolvedValue(reviewedDiff())
    const wrapper = mountEditor(makeDetail())

    await findButton(wrapper, 'Change')!.trigger('click')
    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    await findButton(wrapper, 'Review encrypted diff')!.trigger('click')
    await flushPromises()

    // The reviewed state the panel delivers from, then the push it reports and the diff it
    // consumed to make it.
    store.currentDiff = reviewedDiff()
    await flushPromises()
    expect(wrapper.text()).toContain('1 change reviewed')

    store.deliveryResult = { mode: 'direct', commit_sha: '2a0a5dd', argocd_sync_verified: false }
    store.currentDiff = null
    await flushPromises()

    // Those rows were the plaintext the delivered ciphertext was built from, so they leave
    // with it rather than standing as a change that has already landed.
    expect(wrapper.text()).toContain('Nothing staged.')
    expect(wrapper.text()).not.toContain('1 staged change')
    expect(wrapper.text()).not.toContain('Encrypted diff is ready for review')
    expect(findButton(wrapper, 'Review encrypted diff')).toBeFalsy()
  })
})

describe('delivery panel policy controls', () => {
  it('gates delivery on a server-side dry run', async () => {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt', 'gitops:propose'])
    const store = useSecretsStore(pinia)
    store.currentDiff = reviewedDiff()
    store.pendingMutation = { namespace: 'payments', name: 'api', mutations: [{ key: 'password', operation: 'replace', value: 'rotated' }] }
    // The mapping the panel reads the branch from, as the detail page would have loaded it.
    store.gitPaths = { namespaces: [{ namespace: 'payments', default_path: 'clusters/prod/payments', allowed_paths: ['clusters/prod/payments'], repository: 'org/repo', branch: 'main', mode: 'proposal' }] }
    vi.spyOn(store, 'applyReviewedMutation').mockImplementation(async () => {
      // Mirrors the real action: the pending mutation clears, the reviewed ciphertext
      // and the detail stay.
      store.pendingMutation = null
      return { yaml: 'encrypted-after', checksum: 'sum', diff_before: 'encrypted-before', diff_after: 'encrypted-after' }
    })
    vi.spyOn(store, 'dryRun').mockImplementation(async () => {
      store.dryRunResult = { before: 'git-before', after: 'encrypted-after', path: 'clusters/prod/payments/api.yaml', base_commit: 'abc123', mode: 'proposal' }
      return store.dryRunResult
    })
    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({ mode: 'proposal', commit_sha: '9c1f4a7b2e3d5a6f8091b2c3d4e5f6a7b8c9d0e1', proposal_url: 'https://git.example/pr/7', argocd_sync_verified: false })
    const wrapper = mountPanel(makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }))

    // Stage 'apply': the dry-run gate warns and apply is the only primary action.
    expect(wrapper.text()).toContain('Run dry run before delivery')
    expect(findButton(wrapper, 'Apply reviewed patch')).toBeTruthy()
    expect(findButton(wrapper, 'Run dry run')).toBeFalsy()
    expect(findButton(wrapper, 'Create proposal')).toBeFalsy()

    await findButton(wrapper, 'Apply reviewed patch')!.trigger('click')
    await flushPromises()

    // Stage 'dry-run': the dry-run control replaces the apply control, and the row that now
    // holds it stops claiming it is still waiting on the review above.
    expect(wrapper.text()).toContain('Reviewed patch applied.')
    expect(wrapper.text()).toContain('Nothing is written to Git yet')
    expect(findButton(wrapper, 'Apply reviewed patch')).toBeFalsy()
    expect(findButton(wrapper, 'Run dry run')).toBeTruthy()
    expect(findButton(wrapper, 'Create proposal')).toBeFalsy()
    expect(railRow(wrapper, 'Check against the branch')!.text()).not.toContain('Waiting on the review above')

    await findButton(wrapper, 'Run dry run')!.trigger('click')
    await flushPromises()

    // Stage 'deliver': delivery is gated on the dry-run result.
    expect(wrapper.text()).toContain('Dry run complete.')
    expect(wrapper.text()).toContain('wrote nothing')
    // The base commit is shown as Git prints it, not as the server sent it.
    expect(wrapper.text()).toContain('Path: clusters/prod/payments/api.yaml')
    expect(wrapper.text()).toContain('base commit abc123')
    expect(findButton(wrapper, 'Run dry run')).toBeFalsy()
    expect(findButton(wrapper, 'Create proposal')).toBeTruthy()

    // The open row is the one carrying the delivery button, so it is the one that has to name
    // the file it writes — the row that resolved the path folded two stages ago — and it is the
    // one row that must not still be telling the operator to run the dry run it just ran.
    const deliverRow = railRow(wrapper, 'Deliver')!
    expect(deliverRow.text()).toContain('Path: clusters/prod/payments/api.yaml')
    expect(deliverRow.text()).toContain('branch main')
    expect(deliverRow.text()).not.toContain('Run dry run before delivery')

    await findButton(wrapper, 'Create proposal')!.trigger('click')
    await flushPromises()

    expect(deliver).toHaveBeenCalledTimes(1)
    // The diff carries no target_path, so the file name comes from the detail's
    // discovered file_path.
    expect(deliver).toHaveBeenCalledWith('payments', 'api', 'encrypted-after', 'abc123', 'clusters/prod/payments/api.yaml')
    expect(wrapper.text()).toContain('https://git.example/pr/7')
    expect(wrapper.text()).toMatch(/ArgoCD .*not verified/)

    // The outcome names what was written; the commit is the seven characters Git
    // prints rather than the whole hash.
    expect(wrapper.text()).toContain('Proposal opened')
    expect(wrapper.text()).toContain('Pushed 9c1f4a7 to main at clusters/prod/payments/api.yaml and opened a merge proposal.')
    const proposal = wrapper.find('a[href="https://git.example/pr/7"]')
    expect(proposal.exists()).toBe(true)
    expect(proposal.attributes('rel')).toBe('noopener noreferrer')

    // The delivery consumed the review: without the delivered state the panel would
    // offer the same push again against ciphertext it has already sent.
    expect(findButton(wrapper, 'Create proposal')).toBeFalsy()
    expect(wrapper.text()).not.toContain('Delivery unavailable')
  })

  it('runs the dry run straight off the reviewed diff when nothing is pending', async () => {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt', 'gitops:propose'])
    const store = useSecretsStore(pinia)
    store.currentDiff = reviewedDiff()
    const dryRun = vi.spyOn(store, 'dryRun').mockImplementation(async () => {
      store.dryRunResult = { before: 'git-before', after: 'encrypted-after', path: 'clusters/prod/payments/api.yaml', base_commit: 'abc123', mode: 'proposal' }
      return store.dryRunResult
    })
    const wrapper = mountPanel(makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }))

    // No pending mutation: the apply step is skipped.
    expect(findButton(wrapper, 'Apply reviewed patch')).toBeFalsy()
    expect(findButton(wrapper, 'Run dry run')).toBeTruthy()

    await findButton(wrapper, 'Run dry run')!.trigger('click')
    await flushPromises()

    expect(dryRun).toHaveBeenCalledWith('payments', 'api', 'encrypted-after', 'abc123', 'clusters/prod/payments/api.yaml')
    expect(findButton(wrapper, 'Create proposal')).toBeTruthy()
  })

  it('opens the row the flow stands on and folds the ones it has left', async () => {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt', 'gitops:propose'])
    const store = useSecretsStore(pinia)
    store.currentDiff = reviewedDiff()
    vi.spyOn(store, 'dryRun').mockImplementation(async () => {
      store.dryRunResult = { before: 'git-before', after: 'encrypted-after', path: 'clusters/prod/payments/api.yaml', base_commit: 'abc123', mode: 'proposal' }
      return store.dryRunResult
    })
    const wrapper = mountPanel(makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }))

    // The rows that can be toggled, in order. A row the flow has not reached carries no
    // `aria-expanded` at all, because there is nothing for it to open.
    const rows = () => wrapper.findAll('button').filter((button) => button.attributes('aria-expanded') !== undefined)

    // Standing on Check: Review folded, Check open, Deliver not yet reachable.
    expect(rows().map((row) => row.attributes('aria-expanded'))).toEqual(['false', 'true'])

    await findButton(wrapper, 'Run dry run')!.trigger('click')
    await flushPromises()

    // Deliver open, and the folded Check row still names the path and base commit the
    // delivery is made against.
    expect(rows().map((row) => row.attributes('aria-expanded'))).toEqual(['false', 'false', 'true'])
    expect(rows()[1].text()).toContain('clusters/prod/payments/api.yaml')
    expect(rows()[1].text()).toContain('base commit abc123')

    // A folded row is a toggle, not a dead end.
    await rows()[0].trigger('click')
    expect(rows()[0].attributes('aria-expanded')).toBe('true')
    expect(rows()[0].text()).toContain('Includes: replace password')
  })

  it('names the commit, branch, and file for a direct push', async () => {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt', 'gitops:push'])
    const store = useSecretsStore(pinia)
    store.dryRunResult = { before: 'git-before', after: 'encrypted-after', path: 'kube/immich/tet-cred.yml', base_commit: 'abc1234def', mode: 'direct' }
    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({
      mode: 'direct',
      commit_sha: '2a0a5dd0ac92dd290240811b4d3ef0ee8afa1be1',
      branch: 'main',
      file_path: 'kube/immich/tet-cred.yml',
      argocd_sync_verified: false,
    })
    const wrapper = mountPanel(makeDetail({ git: { ...makeDetail().git, delivery_mode: 'direct' } }))

    await findButton(wrapper, 'Deliver directly')!.trigger('click')
    await flushPromises()

    expect(deliver).toHaveBeenCalledTimes(1)
    // A direct push has no proposal URL, so every field the server sent is reported
    // rather than a bare hash.
    expect(wrapper.text()).toContain('Delivered directly')
    expect(wrapper.text()).toContain('Committed 2a0a5dd to main at kube/immich/tet-cred.yml.')
    expect(wrapper.text()).toMatch(/ArgoCD .*not verified/)
    // Nothing offers a second push of what has just landed.
    expect(findButton(wrapper, 'Deliver directly')).toBeFalsy()
    expect(wrapper.text()).not.toContain('Delivery unavailable')
  })

  it('withholds delivery when the namespace capability is missing', () => {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt'])
    useSecretsStore(pinia).currentDiff = reviewedDiff()
    const wrapper = mountPanel(makeDetail())

    expect(wrapper.text()).toContain('Delivery unavailable')
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Deliver directly')
  })

  it('exposes no control for repository, branch, path, or mode', () => {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt', 'gitops:propose'])
    useSecretsStore(pinia).currentDiff = reviewedDiff()
    const wrapper = mountPanel(makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }))

    expect(wrapper.findAll('input, select, textarea')).toHaveLength(0)
    const labelled = wrapper.findAll('[aria-label]').map((node) => node.attributes('aria-label'))
    expect(labelled.filter((label) => /repository|branch|path|delivery mode/i.test(label ?? ''))).toHaveLength(0)
  })
})

describe('new secret draft review', () => {
  it('hands the ciphertext to the shared review state, runs a dry run, and delivers', async () => {
    grant(pinia, 'payments', ['secret:seal', 'gitops:propose'])
    const store = useSecretsStore(pinia)
    vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)

    const form = mount(SecretNameEditor, { props: { namespace: 'payments', baseCommit: 'abc123' }, global: { plugins: [pinia] } })
    await form.find('input[aria-label="New secret name"]').setValue('new-cred')
    await form.find('textarea').setValue('kind: Secret\nstringData:\n  password: plaintext-marker')
    await form.findAll('button').find((button) => button.text() === 'Encrypt for review')!.trigger('click')
    await flushPromises()

    expect(store.newSecretDraft).toMatchObject({ namespace: 'payments', name: 'new-cred', yaml: 'encrypted-new-secret', base_commit: 'abc123' })
    // Reset to the template, not to nothing: it holds no values, so no part of the
    // submitted manifest survives while the document's shape does.
    const reset = (form.find('textarea').element as HTMLTextAreaElement).value
    expect(reset).toContain('kind: Secret')
    expect(reset).toContain('name: new-cred')
    expect(reset).not.toContain('plaintext-marker')
    expect(form.html()).not.toContain('plaintext-marker')
    expect(JSON.stringify(store.$state)).not.toContain('plaintext-marker')

    vi.spyOn(store, 'dryRun').mockImplementation(async () => {
      store.dryRunResult = { before: 'git-before', after: 'encrypted-new-secret', path: 'clusters/prod/payments/new-cred.yaml', base_commit: 'abc123', mode: 'proposal' }
      return store.dryRunResult
    })
    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({ mode: 'proposal', commit_sha: 'cafe', proposal_url: 'https://git.example/pr/9', argocd_sync_verified: false })
    const panel = mountPanel(makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }))
    expect(panel.html()).toContain('encrypted-new-secret')

    // New-secret drafts skip the apply step: there is no keyed patch.
    expect(findButton(panel, 'Apply reviewed patch')).toBeFalsy()
    expect(findButton(panel, 'Run dry run')).toBeTruthy()

    await findButton(panel, 'Run dry run')!.trigger('click')
    await flushPromises()

    expect(findButton(panel, 'Create proposal')).toBeTruthy()

    await findButton(panel, 'Create proposal')!.trigger('click')
    await flushPromises()

    expect(deliver).toHaveBeenCalledWith('payments', 'new-cred', 'encrypted-new-secret', 'abc123', undefined)
    expect(store.newSecretDraft).toBeNull()
  })

  it('renders nothing for users without secret:seal', () => {
    grant(pinia, 'payments', ['metadata:read'])
    const form = mount(SecretNameEditor, { props: { namespace: 'payments', baseCommit: 'abc123' }, global: { plugins: [pinia] } })

    expect(form.findAll('textarea')).toHaveLength(0)
    expect(form.text()).not.toContain('Create new SealedSecret')
  })
})