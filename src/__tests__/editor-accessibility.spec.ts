// Browser-level component checks for the Phase 3 secret editor.
// Covers keyboard reachability, accessible names, masked-by-default values,
// capability-gated controls, and the shared review/delivery state.
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

function revealButtons(wrapper: ReturnType<typeof mountEditor>) {
  return wrapper.findAll('button').filter((button) => button.text() === 'Reveal one key')
}

describe('secret key editor accessibility', () => {
  it('conceals every value until one key is revealed', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const reveal = vi.spyOn(useSecretsStore(pinia), 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const wrapper = mountEditor(makeDetail())

    expect(wrapper.findAll('input[type="password"]')).toHaveLength(0)
    expect(wrapper.text()).toContain('concealed')

    await revealButtons(wrapper)[0].trigger('click')
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

    expect(revealButtons(wrapper)).toHaveLength(0)
    expect(wrapper.findAll('input')).toHaveLength(0)
    expect(wrapper.text()).toContain('Values concealed')
  })

  it('explains drift and keeps the patch control disabled', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    vi.spyOn(useSecretsStore(pinia), 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const wrapper = mountEditor(makeDetail({ git: { ...makeDetail().git, in_sync_with_live: false, drift: 'diverged' } }))

    expect(wrapper.text()).toContain('Editing disabled')
    await revealButtons(wrapper)[0].trigger('click')
    await flushPromises()

    const review = wrapper.findAll('button').find((button) => button.text() === 'Review encrypted diff')
    expect(review?.attributes('disabled')).toBeDefined()
  })

  it('reviews the selected operation from keyboard-operable controls', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    const store = useSecretsStore(pinia)
    vi.spyOn(store, 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const computeDiff = vi.spyOn(store, 'computeDiff').mockResolvedValue({ before: 'b', after: 'a', key: 'password', base_commit: 'abc123', checksum: 'sum' })
    const wrapper = mountEditor(makeDetail())
    await revealButtons(wrapper)[0].trigger('click')
    await flushPromises()

    await wrapper.find('input[aria-label="Replacement value for password"]').setValue('rotated')
    const remove = wrapper.findAll('input[type="radio"]').find((radio) => (radio.element as HTMLInputElement).value === 'delete')
    expect(remove).toBeDefined()
    await remove!.setValue()
    await wrapper.findAll('button').find((button) => button.text() === 'Review encrypted diff')!.trigger('click')
    await flushPromises()

    expect(computeDiff).toHaveBeenCalledWith('payments', 'api', 'password', 'delete', 'rotated', 'abc123')
    expect(wrapper.text()).toContain('Encrypted diff is ready for review.')
  })

  it('names every control, keeps disabled actions out of the tab order, and focuses what is enabled', async () => {
    grant(pinia, 'payments', ['metadata:read', 'secret:seal', 'secret:decrypt'])
    vi.spyOn(useSecretsStore(pinia), 'reveal').mockResolvedValue({ key: 'password', value: 'plain-secret' })
    const wrapper = mountEditor(makeDetail())
    await revealButtons(wrapper)[0].trigger('click')
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
  function reviewedProposal() {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt', 'gitops:propose'])
    useSecretsStore(pinia).currentDiff = { before: 'encrypted-before', after: 'encrypted-after', key: 'password', base_commit: 'abc123', checksum: 'sum' }
    return mount(DeliveryPanel, { props: { detail: makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }) }, global: { plugins: [pinia] } })
  }

  it('offers only the server-selected proposal action', () => {
    const wrapper = reviewedProposal()
    const labels = wrapper.findAll('button').map((button) => button.text())

    expect(labels).toContain('Create proposal')
    expect(labels).not.toContain('Deliver directly')
    expect(wrapper.html()).toContain('encrypted-after')
  })

  it('withholds delivery when the namespace capability is missing', () => {
    grant(pinia, 'payments', ['secret:seal', 'secret:decrypt'])
    useSecretsStore(pinia).currentDiff = { before: 'encrypted-before', after: 'encrypted-after', key: 'password', base_commit: 'abc123', checksum: 'sum' }
    const wrapper = mount(DeliveryPanel, { props: { detail: makeDetail() }, global: { plugins: [pinia] } })

    expect(wrapper.text()).toContain('Delivery unavailable')
    expect(wrapper.findAll('button').map((button) => button.text())).not.toContain('Deliver directly')
  })

  it('exposes no control for repository, branch, path, or mode', () => {
    const wrapper = reviewedProposal()

    expect(wrapper.findAll('input, select, textarea')).toHaveLength(0)
    const labelled = wrapper.findAll('[aria-label]').map((node) => node.attributes('aria-label'))
    expect(labelled.filter((label) => /repository|branch|path|delivery mode/i.test(label ?? ''))).toHaveLength(0)
  })

  it('reports the delivered result without claiming ArgoCD synchronization', async () => {
    const wrapper = reviewedProposal()
    vi.spyOn(useSecretsStore(pinia), 'deliver').mockResolvedValue({ mode: 'proposal', commit_sha: 'deadbeef', proposal_url: 'https://git.example/pr/7', argocd_sync_verified: false })

    await wrapper.findAll('button').find((button) => button.text() === 'Create proposal')!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('https://git.example/pr/7')
    expect(wrapper.text()).toMatch(/ArgoCD .*not verified/)
  })
})

describe('new secret draft review', () => {
  it('hands the ciphertext to the shared review state and drops the plaintext', async () => {
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

    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({ mode: 'proposal', commit_sha: 'cafe', proposal_url: 'https://git.example/pr/9', argocd_sync_verified: false })
    const panel = mount(DeliveryPanel, { props: { detail: makeDetail({ git: { ...makeDetail().git, delivery_mode: 'proposal' } }) }, global: { plugins: [pinia] } })
    expect(panel.html()).toContain('encrypted-new-secret')

    await panel.findAll('button').find((button) => button.text() === 'Create proposal')!.trigger('click')
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
