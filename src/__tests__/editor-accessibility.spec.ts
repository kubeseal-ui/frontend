// Browser-level component checks for the Phase 3 secret editor.
// Covers keyboard reachability, accessible names, masked-by-default values,
// capability-gated controls, the dry-run gate, and the shared review/delivery state.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
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

function reviewedDiff() {
  return { before: 'encrypted-before', after: 'encrypted-after', key: 'password', base_commit: 'abc123', checksum: 'sum' }
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
    vi.spyOn(useSecretsStore(pinia), 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const wrapper = mountEditor(makeDetail({ git: { ...makeDetail().git, in_sync_with_live: false, drift: 'diverged' } }))

    expect(wrapper.text()).toContain('Editing disabled')
    await findButton(wrapper, 'Reveal one key')!.trigger('click')
    await flushPromises()

    const review = wrapper.findAll('button').find((button) => button.text().includes('Review encrypted diff'))
    expect(review?.attributes('disabled')).toBeDefined()
  })

  it('reviews the selected operation from keyboard-operable controls', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const store = useSecretsStore(pinia)
    vi.spyOn(store, 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const computeDiff = vi.spyOn(store, 'computeDiff').mockResolvedValue(reviewedDiff())
    const wrapper = mountEditor(makeDetail())
    await findButton(wrapper, 'Reveal one key')!.trigger('click')
    await flushPromises()

    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    const remove = wrapper.findAll('input[type="radio"]').find((radio) => (radio.element as HTMLInputElement).value === 'delete')
    expect(remove).toBeDefined()
    await remove!.setValue()
    await findButton(wrapper, 'Review encrypted diff')!.trigger('click')
    await flushPromises()

    expect(computeDiff).toHaveBeenCalledWith('payments', 'api', 'password', 'delete', 'rotated', 'abc123')
    expect(wrapper.text()).toContain('Encrypted diff is ready for review.')
  })

  it('names every control, keeps disabled actions out of the tab order, and focuses what is enabled', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    vi.spyOn(useSecretsStore(pinia), 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const wrapper = mountEditor(makeDetail())
    await findButton(wrapper, 'Reveal one key')!.trigger('click')
    await flushPromises()
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
})

describe('delivery panel policy controls', () => {
  it('gates delivery on a server-side dry run', async () => {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt', 'gitops:propose'])
    const store = useSecretsStore(pinia)
    store.currentDiff = reviewedDiff()
    store.pendingMutation = { namespace: 'payments', name: 'api', value: 'rotated', operation: 'replace' }
    vi.spyOn(store, 'applyReviewedMutation').mockImplementation(async () => {
      // The real action advances the workflow: the pending mutation is cleared
      // and the reviewed ciphertext stays in currentDiff for the dry run.
      store.currentDetail = null
      store.pendingMutation = null
      return { yaml: 'encrypted-after', checksum: 'sum', diff_before: 'encrypted-before', diff_after: 'encrypted-after' }
    })
    vi.spyOn(store, 'dryRun').mockImplementation(async () => {
      store.dryRunResult = { before: 'git-before', after: 'encrypted-after', path: 'clusters/prod/payments/api.yaml', base_commit: 'abc123', mode: 'proposal' }
      return store.dryRunResult
    })
    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({ mode: 'proposal', commit_sha: 'deadbeef', proposal_url: 'https://git.example/pr/7', argocd_sync_verified: false })
    const wrapper = mountPanel(makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }))

    // Stage 'apply': the dry-run gate warns and the apply control is the only primary action.
    expect(wrapper.text()).toContain('Run dry run before delivery')
    expect(findButton(wrapper, 'Apply reviewed patch')).toBeTruthy()
    expect(findButton(wrapper, 'Run dry run')).toBeFalsy()
    expect(findButton(wrapper, 'Create proposal')).toBeFalsy()

    await findButton(wrapper, 'Apply reviewed patch')!.trigger('click')
    await flushPromises()

    // Stage 'dry-run': the patch is applied, the dry-run control replaces the apply control.
    expect(wrapper.text()).toContain('Encrypted patch applied and ready for dry run.')
    expect(findButton(wrapper, 'Apply reviewed patch')).toBeFalsy()
    expect(findButton(wrapper, 'Run dry run')).toBeTruthy()
    expect(findButton(wrapper, 'Create proposal')).toBeFalsy()

    await findButton(wrapper, 'Run dry run')!.trigger('click')
    await flushPromises()

    // Stage 'deliver': the dry-run result is shown, the deliver control is gated on it.
    expect(wrapper.text()).toContain('Dry run complete.')
    expect(wrapper.text()).toContain('Path: clusters/prod/payments/api.yaml')
    expect(findButton(wrapper, 'Run dry run')).toBeFalsy()
    expect(findButton(wrapper, 'Create proposal')).toBeTruthy()

    await findButton(wrapper, 'Create proposal')!.trigger('click')
    await flushPromises()

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(deliver).toHaveBeenCalledWith('payments', 'api', 'encrypted-after', 'abc123')
    expect(wrapper.text()).toContain('https://git.example/pr/7')
    expect(wrapper.text()).toMatch(/ArgoCD .*not verified/)
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

    // No pending mutation: the apply step is skipped, the dry-run control leads.
    expect(findButton(wrapper, 'Apply reviewed patch')).toBeFalsy()
    expect(findButton(wrapper, 'Run dry run')).toBeTruthy()

    await findButton(wrapper, 'Run dry run')!.trigger('click')
    await flushPromises()

    expect(dryRun).toHaveBeenCalledWith('payments', 'api', 'encrypted-after', 'abc123')
    expect(findButton(wrapper, 'Create proposal')).toBeTruthy()
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
    expect((form.find('textarea').element as HTMLTextAreaElement).value).toBe('')
    expect(form.html()).not.toContain('plaintext-marker')
    expect(JSON.stringify(store.$state)).not.toContain('plaintext-marker')

    vi.spyOn(store, 'dryRun').mockImplementation(async () => {
      store.dryRunResult = { before: 'git-before', after: 'encrypted-new-secret', path: 'clusters/prod/payments/new-cred.yaml', base_commit: 'abc123', mode: 'proposal' }
      return store.dryRunResult
    })
    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({ mode: 'proposal', commit_sha: 'cafe', proposal_url: 'https://git.example/pr/9', argocd_sync_verified: false })
    const panel = mountPanel(makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }))
    expect(panel.html()).toContain('encrypted-new-secret')

    // New-secret drafts skip the apply step: there is no keyed patch, so the
    // dry-run runs straight off the encrypted draft ciphertext.
    expect(findButton(panel, 'Apply reviewed patch')).toBeFalsy()
    expect(findButton(panel, 'Run dry run')).toBeTruthy()

    await findButton(panel, 'Run dry run')!.trigger('click')
    await flushPromises()

    expect(findButton(panel, 'Create proposal')).toBeTruthy()

    await findButton(panel, 'Create proposal')!.trigger('click')
    await flushPromises()

    expect(deliver).toHaveBeenCalledWith('payments', 'new-cred', 'encrypted-new-secret', 'abc123')
    expect(store.newSecretDraft).toBeNull()
  })

  it('renders nothing for users without secret:seal', () => {
    grant(pinia, 'payments', ['metadata:read'])
    const form = mount(SecretNameEditor, { props: { namespace: 'payments', baseCommit: 'abc123' }, global: { plugins: [pinia] } })

    expect(form.findAll('textarea')).toHaveLength(0)
    expect(form.text()).not.toContain('Create new SealedSecret')
  })
})