// The create-a-Secret flow lives on the namespace, not on an existing Secret's
// detail page. These checks cover the entry point, the deep link, and the fact
// that the flow works in a namespace with no secrets at all — the case the
// detail-page placement could never reach, because the form used to inherit a
// base commit from whichever Secret happened to be open.
//
// Mounting uses the application's real router and pinia singleton, as
// router.spec.ts does: the router guard reads the session from that store, and
// RouterLink needs a router installed to resolve its target.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { router } from '@/router'
import { pinia } from '@/pinia'
import { api, ApiError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import NamespaceView from '@/views/NamespaceView.vue'
import NewSecretView from '@/views/NewSecretView.vue'
import SecretNameEditor from '@/components/SecretNameEditor.vue'
import DeliveryPanel from '@/components/DeliveryPanel.vue'
import type { Capability, GitPathsConfig } from '@/types'

const GIT_PATHS: GitPathsConfig = {
  namespaces: [{
    namespace: 'payments',
    default_path: 'clusters/payments',
    allowed_paths: ['clusters/payments'],
    repository: 'org/repo',
    branch: 'main',
    mode: 'proposal',
  }],
}

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  document.body.innerHTML = ''
})

function grant(capabilities: Capability[]) {
  useAuthStore(pinia).setSession({ email: 'u@example.com', name: 'User', username: 'u', namespaces: { payments: capabilities } })
}

function findButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((button) => button.text() === label)
}

function mountNamespaceView() {
  return mount(NamespaceView, { props: { namespace: 'payments' }, global: { plugins: [pinia, router] } })
}

function mountNewSecretView() {
  return mount(NewSecretView, { props: { namespace: 'payments' }, global: { plugins: [pinia, router] } })
}

/** Drives the create form the way a user does, leaving the draft encrypted. */
async function encryptDraft(wrapper: VueWrapper, name: string) {
  await wrapper.find('input[aria-label="New secret name"]').setValue(name)
  await wrapper.find('textarea').setValue('kind: Secret\nstringData:\n  password: plaintext-marker')
  await findButton(wrapper, 'Encrypt for review')!.trigger('click')
  await flushPromises()
}

describe('the namespace owns the create entry point', () => {
  it('offers the button to a user who can seal, and routes to the create page', async () => {
    grant(['metadata:read', 'secret:seal'])
    vi.spyOn(api, 'get').mockResolvedValue({ data: { secrets: [] } } as never)
    const push = vi.spyOn(router, 'push').mockResolvedValue(undefined as never)

    const wrapper = mountNamespaceView()
    await flushPromises()

    const button = findButton(wrapper, 'Create new Secret')
    expect(button).toBeTruthy()

    await button!.trigger('click')
    expect(push).toHaveBeenCalledWith('/namespaces/payments/new')
  })

  it('withholds the button from a user who cannot seal', async () => {
    grant(['metadata:read'])
    vi.spyOn(api, 'get').mockResolvedValue({ data: { secrets: [] } } as never)

    const wrapper = mountNamespaceView()
    await flushPromises()

    expect(findButton(wrapper, 'Create new Secret')).toBeFalsy()
  })
})

describe('the create page', () => {
  it('says why a deep link is refused instead of rendering an unusable form', async () => {
    grant(['metadata:read'])
    const wrapper = mountNewSecretView()
    await flushPromises()

    expect(wrapper.text()).toContain('Access denied')
    expect(wrapper.text()).toContain('secret:seal')
    expect(wrapper.findComponent(SecretNameEditor).exists()).toBe(false)
  })

  it('runs form to encryption to dry run to delivery with no Secret detail anywhere', async () => {
    grant(['secret:seal', 'gitops:propose'])
    const store = useSecretsStore(pinia)
    vi.spyOn(api, 'getGitPaths').mockResolvedValue(GIT_PATHS)
    // The server reports the branch head it verified the vacant path against.
    vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret', base_commit: 'head-1' } } as never)

    const wrapper = mountNewSecretView()
    await flushPromises()
    await encryptDraft(wrapper, 'brand-new')

    // The base commit came from the encrypt response, not from another Secret.
    expect(store.newSecretDraft).toMatchObject({ namespace: 'payments', name: 'brand-new', base_commit: 'head-1' })
    // The plaintext never reaches the component tree or the store.
    expect(wrapper.html()).not.toContain('plaintext-marker')
    expect(JSON.stringify(store.$state)).not.toContain('plaintext-marker')

    // The delivery panel has no detail to read a mode from; the mode comes from
    // the namespace's fixed Git policy.
    expect(wrapper.findComponent(DeliveryPanel).exists()).toBe(true)
    expect(findButton(wrapper, 'Run dry run')).toBeTruthy()

    const dryRun = vi.spyOn(store, 'dryRun').mockImplementation(async () => {
      store.dryRunResult = { before: 'git-before', after: 'encrypted-new-secret', path: 'clusters/payments/brand-new.yaml', base_commit: 'head-1', mode: 'proposal' }
      return store.dryRunResult
    })
    await findButton(wrapper, 'Run dry run')!.trigger('click')
    await flushPromises()
    expect(dryRun).toHaveBeenCalledWith('payments', 'brand-new', 'encrypted-new-secret', 'head-1', undefined)

    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({ mode: 'proposal', commit_sha: 'cafe', proposal_url: 'https://git.example/pr/11', argocd_sync_verified: false })
    await findButton(wrapper, 'Create proposal')!.trigger('click')
    await flushPromises()
    expect(deliver).toHaveBeenCalledWith('payments', 'brand-new', 'encrypted-new-secret', 'head-1', undefined)
    expect(wrapper.text()).toContain('https://git.example/pr/11')
  })

  it('withholds delivery when the server reported no base commit', async () => {
    grant(['secret:seal', 'gitops:propose'])
    const store = useSecretsStore(pinia)
    vi.spyOn(api, 'getGitPaths').mockResolvedValue(GIT_PATHS)
    // The namespace is mapped, but the response carries no head for it.
    vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)

    const wrapper = mountNewSecretView()
    await flushPromises()
    await encryptDraft(wrapper, 'brand-new')

    expect(store.newSecretDraft?.base_commit).toBe('')
    // Both GitOps endpoints reject an empty base commit, so neither control is
    // offered rather than being offered and then refused with a 400.
    expect(findButton(wrapper, 'Run dry run')).toBeFalsy()
    expect(wrapper.text()).toContain('Delivery unavailable')
  })

  it('explains an occupied mapped path instead of overwriting the manifest', async () => {
    grant(['secret:seal'])
    vi.spyOn(api, 'getGitPaths').mockResolvedValue(GIT_PATHS)
    vi.spyOn(api, 'post').mockRejectedValue(new ApiError(409, { error: { code: 'PATH_OCCUPIED', message: 'A manifest for this Secret already exists at the mapped path' } }))

    const wrapper = mountNewSecretView()
    await flushPromises()
    await encryptDraft(wrapper, 'api-credentials')

    expect(useSecretsStore(pinia).newSecretDraft).toBeNull()
    expect(wrapper.text()).toContain('already exists at the mapped path')
    expect(wrapper.text()).toContain('existing Secret')
  })

  it('discards an unfinished draft when the page is left', async () => {
    grant(['secret:seal'])
    const store = useSecretsStore(pinia)
    store.newSecretDraft = { namespace: 'payments', name: 'brand-new', scope: 'strict', yaml: 'encrypted-new-secret', base_commit: 'head-1' }
    vi.spyOn(api, 'getGitPaths').mockResolvedValue(GIT_PATHS)

    const wrapper = mountNewSecretView()
    await flushPromises()
    expect(store.newSecretDraft).not.toBeNull()

    wrapper.unmount()
    expect(store.newSecretDraft).toBeNull()
  })
})
