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
  // Every mount of the create page resolves the namespace's Git paths. Left
  // unmocked that is a real request to the happy-dom document origin
  // (http://localhost:3000), and because the store is a singleton shared across
  // these tests, its connection failure lands *after* the test that started it
  // — running fetchGitPaths's catch and clearing gitPaths out from under a
  // later test, which surfaces as a missing delivery control rather than as a
  // failed fetch. Mocking it here means no test can leak a real request.
  vi.spyOn(api, 'getGitPaths').mockResolvedValue(GIT_PATHS)
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

    // The delivery consumed the draft, and the base commit came from it. This
    // panel has no detail to fall back to, so what is left is the outcome — not
    // the availability warning, which would announce that there is nothing to
    // deliver against immediately after a delivery that succeeded.
    expect(store.newSecretDraft).toBeNull()
    expect(wrapper.text()).not.toContain('Delivery unavailable')
    expect(wrapper.text()).not.toContain('did not report a base commit')
  })

  it('withholds delivery when the server reported no base commit', async () => {
    grant(['secret:seal', 'gitops:propose'])
    const store = useSecretsStore(pinia)
    // The namespace is mapped, but the response carries no head for it.
    vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)

    const wrapper = mountNewSecretView()
    await flushPromises()
    await encryptDraft(wrapper, 'brand-new')

    expect(store.newSecretDraft?.base_commit).toBe('')
    // Both GitOps endpoints reject an empty base commit, so neither control is
    // offered rather than being offered and then refused with a 400. The
    // namespace is mapped, so the alert must be the missing-head one, not the
    // no-delivery-policy one — both carry the same "Delivery unavailable" title.
    expect(findButton(wrapper, 'Run dry run')).toBeFalsy()
    expect(wrapper.text()).toContain('Delivery unavailable')
    expect(wrapper.text()).toContain('did not report a base commit')
  })

  it('explains an occupied mapped path instead of overwriting the manifest', async () => {
    grant(['secret:seal'])
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

    const wrapper = mountNewSecretView()
    await flushPromises()
    expect(store.newSecretDraft).not.toBeNull()

    wrapper.unmount()
    expect(store.newSecretDraft).toBeNull()
  })
})

// The box starts from a Secret manifest with the frame already written, so the
// operator supplies values rather than the document. These checks pin the three
// things that makes possible to get wrong: a name written in two places, a
// template that submits itself, and a template that eats a pasted manifest.
describe('the manifest template', () => {
  function textarea(wrapper: VueWrapper) {
    return wrapper.find('textarea').element as HTMLTextAreaElement
  }

  it('starts the box from a Secret and keeps its name line on the name field', async () => {
    grant(['secret:seal'])
    const wrapper = mountNewSecretView()
    await flushPromises()

    // Seeded before any name is typed, with the namespace the route owns.
    expect(textarea(wrapper).value).toContain('kind: Secret')
    expect(textarea(wrapper).value).toContain('namespace: payments')
    expect(textarea(wrapper).value).toContain('stringData:')

    await wrapper.find('input[aria-label="New secret name"]').setValue('api-credentials')

    // One authority for the name: the server refuses a manifest whose
    // metadata.name disagrees with the request, so this line follows the field
    // rather than being a second place to write it.
    expect(textarea(wrapper).value).toContain('name: api-credentials')
    expect(textarea(wrapper).value.match(/name:/g)).toHaveLength(1)
  })

  it('withholds encryption until the template has been filled in', async () => {
    grant(['secret:seal'])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)
    const wrapper = mountNewSecretView()
    await flushPromises()

    await wrapper.find('input[aria-label="New secret name"]').setValue('brand-new')
    const encrypt = findButton(wrapper, 'Encrypt for review')!

    // A template that seals one empty value is one keystroke from being
    // delivered, so the control stays withheld and the page says why.
    expect(encrypt.attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('Fill in the template')

    await wrapper.find('textarea').setValue('kind: Secret\nstringData:\n  token: value')
    expect(findButton(wrapper, 'Encrypt for review')!.attributes('disabled')).toBeUndefined()

    await findButton(wrapper, 'Encrypt for review')!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/api/v1/secrets/encrypt', expect.objectContaining({ name: 'brand-new', yaml: 'kind: Secret\nstringData:\n  token: value' }))
  })

  it('gives the adopt source an empty box and leaves a pasted manifest alone', async () => {
    grant(['secret:seal'])
    const wrapper = mountNewSecretView()
    await flushPromises()

    const adopt = wrapper.findAll('input[type="radio"]').find((radio) => (radio.element as HTMLInputElement).value === 'adopt')
    expect(adopt).toBeDefined()
    await adopt!.setValue()

    // Nothing to paste over: adopting starts from kubectl output, not a frame.
    expect(textarea(wrapper).value).toBe('')

    const pasted = 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: live\nstringData:\n  password: pasted-marker'
    await wrapper.find('textarea').setValue(pasted)

    // Back to writing a new one: a manifest already in the box is not the
    // component's to overwrite, even though the source changed underneath it.
    const create = wrapper.findAll('input[type="radio"]').find((radio) => (radio.element as HTMLInputElement).value === 'create')
    await create!.setValue()

    expect(textarea(wrapper).value).toBe(pasted)
  })
})
