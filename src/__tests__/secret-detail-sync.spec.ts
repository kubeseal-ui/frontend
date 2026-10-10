// Sync is the second way this UI writes to Git and answers with the same result shape
// delivery does, so these checks pin that the whole answer is reported and that the
// control is not offered where the endpoint could only refuse it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { ApiError } from '@/api'
import { router } from '@/router'
import { pinia } from '@/pinia'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import SecretDetailView from '@/views/SecretDetailView.vue'
import type { Capability, GitState, SealedSecretDetail } from '@/types'

function detail(git: Partial<GitState> = {}, overrides: Partial<SealedSecretDetail> = {}): SealedSecretDetail {
  return {
    name: 'api',
    namespace: 'payments',
    keys: ['password'],
    key_count: 1,
    scope: 'strict',
    created_at: '2026-09-01T00:00:00Z',
    git: { managed: true, in_sync_with_live: false, drift: 'live_only', ...git },
    ...overrides,
  }
}

function grant(capabilities: Capability[]) {
  useAuthStore(pinia).setSession({ email: 'u@example.com', name: 'User', username: 'u', namespaces: { payments: capabilities } })
}

function findButton(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((button) => button.text() === label)
}

// The route is pushed before the mount so the component reads the parameters it is
// mounted for. The Git path listing is mocked because the page resolves it alongside
// the detail; left unmocked it is a real request to the happy-dom origin.
async function mountDetail(reported: SealedSecretDetail) {
  const store = useSecretsStore(pinia)
  vi.spyOn(store, 'fetchDetail').mockImplementation(async () => { store.currentDetail = reported; return reported })
  vi.spyOn(store, 'fetchGitPaths').mockResolvedValue(null)
  await router.push(`/secrets/${reported.namespace}/${reported.name}`)
  const wrapper = mount(SecretDetailView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, store }
}

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  document.body.innerHTML = ''
})

describe('syncing a live Secret into Git', () => {
  it('reports the commit, the branch, the file, and the proposal a sync wrote', async () => {
    grant(['metadata:read', 'secret:seal', 'secret:decrypt', 'gitops:propose'])
    const { wrapper, store } = await mountDetail(detail({
      drift: 'diverged',
      base_commit: 'abc1234def',
      file_path: 'clusters/payments/api.yaml',
      branch: 'main',
      delivery_mode: 'proposal',
    }))
    const sync = vi.spyOn(store, 'syncToGit').mockResolvedValue({
      mode: 'proposal',
      commit_sha: 'cafe1234babe',
      branch: 'proposal/api',
      file_path: 'clusters/payments/api.yaml',
      proposal_url: 'https://git.example/pr/12',
      argocd_sync_verified: false,
    })

    await findButton(wrapper, 'Sync Live Secret to Git')!.trigger('click')
    await flushPromises()

    // The head the server reported is what the sync is built on: the endpoint compares
    // it against the branch head and refuses an empty one.
    expect(sync).toHaveBeenCalledWith('payments', 'api', 'abc1234def')
    expect(wrapper.text()).toContain('Proposal opened')
    expect(wrapper.text()).toContain('Synced cafe123 to proposal/api at clusters/payments/api.yaml and opened a merge proposal.')
    const proposal = wrapper.find('a[href="https://git.example/pr/12"]')
    expect(proposal.exists()).toBe(true)
    expect(proposal.attributes('target')).toBe('_blank')
    expect(proposal.attributes('rel')).toBe('noopener noreferrer')
    // "Delivered" invites the reader to assume the cluster already has the change.
    expect(wrapper.text()).toMatch(/ArgoCD .*not verified/)
  })

  it('withholds the sync and says why when the Git state reports no branch head', async () => {
    grant(['metadata:read', 'secret:seal', 'secret:decrypt', 'gitops:push'])
    // The drift the sync exists for — live, with no manifest in Git — on a server that
    // reported no head to build the file on.
    const { wrapper, store } = await mountDetail(detail({
      drift: 'live_only',
      delivery_mode: 'direct',
      file_path: 'clusters/payments/api.yaml',
    }))
    const sync = vi.spyOn(store, 'syncToGit')

    expect(findButton(wrapper, 'Sync Live Secret to Git')).toBeFalsy()
    expect(wrapper.text()).toContain('there is no branch head to sync against')
    // The state is named the way the namespace cards name it, not as the enum the API sends.
    expect(wrapper.text()).toContain('Status: Live only.')
    expect(wrapper.text()).not.toContain('live_only')
    expect(sync).not.toHaveBeenCalled()
  })

  it('explains a namespace with no Git policy and names the state in words', async () => {
    grant(['metadata:read', 'gitops:push'])
    // No delivery_mode: the server reports one alongside every mapping it resolves, so
    // its absence is the absence of a mapping.
    const { wrapper } = await mountDetail(detail({ drift: 'unknown' }))

    expect(findButton(wrapper, 'Sync Live Secret to Git')).toBeFalsy()
    expect(wrapper.text()).toContain('This namespace has no Git delivery policy')
    // The state is named in words, the same words the cards use.
    expect(wrapper.text()).toContain('Status: Unknown.')
    expect(wrapper.text()).not.toContain('Status: unknown.')
  })

  it('clears the previous Secret’s sync report when the page loads another', async () => {
    grant(['metadata:read', 'secret:seal', 'secret:decrypt', 'gitops:push'])
    const { wrapper, store } = await mountDetail(detail({
      drift: 'diverged',
      base_commit: 'head-1',
      delivery_mode: 'direct',
      file_path: 'clusters/payments/api.yaml',
      branch: 'main',
    }))
    vi.spyOn(store, 'syncToGit').mockResolvedValue({
      mode: 'direct',
      commit_sha: 'abcdef1234',
      branch: 'main',
      file_path: 'clusters/payments/api.yaml',
      argocd_sync_verified: false,
    })

    await findButton(wrapper, 'Sync Live Secret to Git')!.trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Synced abcdef1 to main at clusters/payments/api.yaml.')

    // The route record is the same and the router view is unkeyed, so this instance is
    // reused: a report belonging to the synced Secret must not render above the next one.
    const other = detail({ drift: 'diverged', base_commit: 'head-2', delivery_mode: 'direct' }, { name: 'billing' })
    vi.spyOn(store, 'fetchDetail').mockImplementation(async () => { store.currentDetail = other; return other })
    await router.push('/secrets/payments/billing')
    await flushPromises()

    expect(wrapper.text()).toContain('billing')
    expect(wrapper.text()).not.toContain('Synced abcdef1')
  })

  it('withholds the sync and names what it would discard when Git moved past the Secret', async () => {
    grant(['metadata:read', 'secret:seal', 'secret:decrypt', 'gitops:push'])
    const { wrapper, store } = await mountDetail(detail({
      drift: 'diverged',
      base_commit: 'head-2',
      file_path: 'clusters/payments/api.yaml',
      branch: 'main',
      delivery_mode: 'direct',
      git_moved_ahead: true,
    }))
    const sync = vi.spyOn(store, 'syncToGit').mockResolvedValue({
      mode: 'direct',
      commit_sha: 'abcdef1234',
      branch: 'main',
      file_path: 'clusters/payments/api.yaml',
      argocd_sync_verified: false,
    })

    // The plain control would read as "publish this Secret", which is the opposite of what it does.
    expect(findButton(wrapper, 'Sync Live Secret to Git')).toBeFalsy()
    expect(wrapper.text()).toContain('the mapped file was rewritten after the version in the cluster')
    expect(wrapper.text()).toContain('Syncing would overwrite that change')

    // Withheld, not removed: the operator who means it can still say so.
    await findButton(wrapper, 'Sync anyway')!.trigger('click')
    await flushPromises()
    expect(sync).toHaveBeenCalledWith('payments', 'api', 'head-2')
    expect(wrapper.text()).toContain('Synced abcdef1 to main at clusters/payments/api.yaml.')
  })

  it('offers the plain sync when the live Secret was edited in the cluster', async () => {
    grant(['metadata:read', 'secret:seal', 'secret:decrypt', 'gitops:push'])
    // Diverged with no claim about which side moved: the server read no earlier version that
    // matches the live Secret, so Git did not move past it.
    const { wrapper } = await mountDetail(detail({
      drift: 'diverged',
      base_commit: 'head-2',
      delivery_mode: 'direct',
      git_moved_ahead: false,
    }))

    expect(findButton(wrapper, 'Sync Live Secret to Git')).toBeTruthy()
    expect(findButton(wrapper, 'Sync anyway')).toBeFalsy()
    expect(wrapper.text()).not.toContain('Syncing would overwrite that change')
  })

  it('reports the server’s request id when the page cannot load the Secret', async () => {
    grant(['metadata:read'])
    const store = useSecretsStore(pinia)
    vi.spyOn(store, 'fetchDetail').mockRejectedValue(new ApiError(502, {
      error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Kubernetes unavailable', request_id: 'req-42' },
    }))
    vi.spyOn(store, 'fetchGitPaths').mockResolvedValue(null)

    await router.push('/secrets/payments/queue')
    const wrapper = mount(SecretDetailView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    // The id is the only handle tying what the operator saw to the server log line
    // that explains it.
    expect(wrapper.text()).toContain('Kubernetes unavailable')
    expect(wrapper.text()).toContain('request id req-42')
  })
})
