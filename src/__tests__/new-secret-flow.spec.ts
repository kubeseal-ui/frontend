// The create-a-Secret flow lives on the namespace, not on an existing Secret's detail
// page: it must work in a namespace with no secrets at all, and must not inherit a base
// commit from whichever Secret happened to be open. Mounting uses the real router and
// pinia singleton, as the guard reads the session from that store and RouterLink needs a
// router installed.
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
    path_template: 'clusters/{namespace}/{name}.yaml',
    allowed_paths: ['custom/apps'],
    repository: 'org/repo',
    branch: 'main',
    mode: 'proposal',
  }],
}

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  // Left unmocked, resolving Git paths is a real request to the happy-dom origin: the
  // singleton store's failure lands after the test that started it and clears gitPaths
  // under a later one, surfacing as a missing control rather than a failed fetch.
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

function mountNewSecretView(attachTo?: HTMLElement) {
  return mount(NewSecretView, { props: { namespace: 'payments' }, attachTo, global: { plugins: [pinia, router] } })
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
    // The draft holds ciphertext, so the manifest box is the page's only copy of the
    // plaintext — and the store never sees it.
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('plaintext-marker')
    expect(JSON.stringify(store.$state)).not.toContain('plaintext-marker')

    // No detail to read a mode from: it comes from the namespace's fixed Git policy.
    expect(wrapper.findComponent(DeliveryPanel).exists()).toBe(true)
    // The alert states the destination the server resolved, with no control offering
    // to change it.
    expect(wrapper.text()).toContain('repository org/repo')
    expect(wrapper.text()).toContain('branch main')
    expect(wrapper.text()).toContain('proposal delivery')
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
    // The outcome names the commit, the branch, and the file it wrote — the dry run's
    // resolved path, since a new Secret has no detail to read one from.
    expect(wrapper.text()).toContain('Proposal opened')
    expect(wrapper.text()).toContain('Pushed cafe to main at clusters/payments/brand-new.yaml and opened a merge proposal.')
    const opened = wrapper.find('a[href="https://git.example/pr/11"]')
    expect(opened.exists()).toBe(true)
    expect(opened.attributes('target')).toBe('_blank')
    expect(opened.attributes('rel')).toBe('noopener noreferrer')

    // The destination stays whole after the push: the delivery clears the draft the
    // panel read the namespace, and with it the destination, from, so recomputing the
    // sentence afterwards would empty it while the change went exactly where it said.
    expect(wrapper.text()).toContain('repository org/repo')
    expect(wrapper.text()).toContain('branch main')
    expect(wrapper.text()).toContain('proposal delivery')

    // The delivery consumed the draft, and this panel has no detail to fall back to,
    // so what is left is the outcome — not an availability warning.
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
    // An empty base commit is refused by both GitOps endpoints, so neither control is
    // offered. The namespace is mapped, so this must be the missing-head alert rather
    // than the no-policy one — both carry the same title.
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

  it('keeps the manifest behind Edit once a draft is encrypted', async () => {
    grant(['secret:seal'])
    vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret', base_commit: 'head-1' } } as never)

    const wrapper = mountNewSecretView()
    await flushPromises()
    await encryptDraft(wrapper, 'brand-new')

    // The draft holds ciphertext, so this box is the only copy of what the operator
    // wrote: reopening the stage on a fresh template leaves them nothing to correct.
    await findButton(wrapper, 'Edit')!.trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('plaintext-marker')

    // Discard is what starts the next Secret from a clean template.
    await findButton(wrapper, 'Discard encrypted draft')!.trigger('click')
    await flushPromises()
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toContain('key: ""')
  })
})

// An allowed path is a directory prefix the destination must sit under, so submitting the
// entry itself is refused; the file name only exists once a Secret name is typed.
describe('the target directory picker', () => {
  function select(wrapper: VueWrapper) {
    return wrapper.find('select')
  }

  it('offers the mapped directories and submits the chosen one with the file under it', async () => {
    grant(['secret:seal'])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)

    const wrapper = mountNewSecretView()
    await flushPromises()

    expect(select(wrapper).findAll('option').map((option) => option.text())).toEqual(['Use default path', 'custom/apps'])

    await wrapper.find('input[aria-label="New secret name"]').setValue('brand-new')
    // The template's file name needs no directory chosen, so the hint can name the whole
    // destination the default lands on before the picker is touched.
    expect(wrapper.text()).toContain('Default: clusters/payments/brand-new.yaml')

    await select(wrapper).setValue('custom/apps')
    await wrapper.find('textarea').setValue('kind: Secret\nstringData:\n  password: plaintext-marker')
    await findButton(wrapper, 'Encrypt for review')!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/api/v1/secrets/encrypt', expect.objectContaining({ target_path: 'custom/apps/brand-new.yaml' }))
  })

  it('leaves the destination to the server when no directory is chosen', async () => {
    grant(['secret:seal'])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)

    const wrapper = mountNewSecretView()
    await flushPromises()
    await encryptDraft(wrapper, 'brand-new')

    // The bare default is not a path — sending it would name a directory the server
    // refuses — so the request carries no target at all and the server renders it.
    expect(post).toHaveBeenCalledWith('/api/v1/secrets/encrypt', expect.objectContaining({ target_path: undefined }))
  })

  it('renders a namespace placeholder inside an allowed directory', async () => {
    grant(['secret:seal'])
    // A prefix may name the namespace itself; the server replaces it before comparing, so the
    // client has to offer — and submit — the replaced one.
    vi.spyOn(api, 'getGitPaths').mockResolvedValue({
      namespaces: [{
        namespace: 'payments',
        path_template: 'clusters/{namespace}/{name}.yaml',
        allowed_paths: ['apps/{namespace}'],
        repository: 'org/repo',
        branch: 'main',
        mode: 'direct',
      }],
    })
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)

    const wrapper = mountNewSecretView()
    await flushPromises()

    expect(select(wrapper).findAll('option').map((option) => option.text())).toEqual(['Use default path', 'apps/payments'])

    await wrapper.find('input[aria-label="New secret name"]').setValue('brand-new')
    await select(wrapper).setValue('apps/payments')
    await wrapper.find('textarea').setValue('kind: Secret\nstringData:\n  password: plaintext-marker')
    await findButton(wrapper, 'Encrypt for review')!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/api/v1/secrets/encrypt', expect.objectContaining({ target_path: 'apps/payments/brand-new.yaml' }))
  })
})

// The template pins three things that are easy to get wrong: a name written in two
// places, a template that submits itself, and a template that eats a pasted manifest.
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

    // One authority for the name: the server refuses a manifest whose metadata.name
    // disagrees with the request, so this line follows the field.
    expect(textarea(wrapper).value).toContain('name: api-credentials')
    expect(textarea(wrapper).value.match(/name:/g)).toHaveLength(1)
  })

  it('answers an unfilled template when encryption is pressed', async () => {
    grant(['secret:seal'])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)
    // Attached, so the move the press makes onto the short field is observable.
    const wrapper = mountNewSecretView(document.body)
    await flushPromises()

    await wrapper.find('input[aria-label="New secret name"]').setValue('brand-new')
    const encrypt = findButton(wrapper, 'Encrypt for review')!

    // A template that would seal one empty value is not a reason to grey the control out.
    // Pressing it is the operator asking what is missing, and nothing is asked or said
    // before they do.
    expect(encrypt.attributes('disabled')).toBeUndefined()
    expect(wrapper.text()).not.toContain('only the template')

    await encrypt.trigger('click')
    await flushPromises()

    expect(post).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('only the template')
    expect(textarea(wrapper).getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(textarea(wrapper))

    // Filling the box answers it live, without a second press.
    await wrapper.find('textarea').setValue('kind: Secret\nstringData:\n  token: value')
    expect(wrapper.text()).not.toContain('only the template')

    await findButton(wrapper, 'Encrypt for review')!.trigger('click')
    await flushPromises()

    expect(post).toHaveBeenCalledWith('/api/v1/secrets/encrypt', expect.objectContaining({ name: 'brand-new', yaml: 'kind: Secret\nstringData:\n  token: value' }))
    wrapper.unmount()
  })

  it('answers a missing name before the manifest, and points at it', async () => {
    grant(['secret:seal'])
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { yaml: 'encrypted-new-secret' } } as never)
    const wrapper = mountNewSecretView(document.body)
    await flushPromises()

    await findButton(wrapper, 'Encrypt for review')!.trigger('click')
    await flushPromises()

    expect(post).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('This Secret needs a name.')
    expect(document.activeElement).toBe(wrapper.find('input[aria-label="New secret name"]').element)
    wrapper.unmount()
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

    // A manifest already in the box is not the component's to overwrite, even though
    // the source changed underneath it.
    const create = wrapper.findAll('input[type="radio"]').find((radio) => (radio.element as HTMLInputElement).value === 'create')
    await create!.setValue()

    expect(textarea(wrapper).value).toBe(pasted)
  })
})
