// The edit flow's delivery path.
//
// The server resolves a SealedSecret's file through two-tier discovery: the
// mapping's templated path first, then a walk of the repository tree. A Secret
// kept in an application subdirectory is found by the walk, so the templated
// path is *vacant* for it. Delivery that falls back to the template therefore
// does not update the reviewed file — it creates a second one claiming the same
// SealedSecret identity, and the application keeps reading the stale ciphertext
// from the file that was never touched.
//
// The path is named on the wire, and the server resolves the destination from it
// and its own discovery: a name that is not where this Secret already lives is
// refused, so naming the reviewed file can neither write outside the namespace's
// grant nor land the change in a second file beside the reviewed one. These
// checks pin the client half: which path the panel sends.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { pinia } from '@/pinia'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import DeliveryPanel from '@/components/DeliveryPanel.vue'
import type { SealedSecretDetail } from '@/types'

const REVIEWED = 'custom/apps/secrets/api.yaml'
const TEMPLATED = 'clusters/payments/api.yaml'

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  useAuthStore(pinia).setSession({ email: 'u@example.com', name: 'User', username: 'u', namespaces: { payments: ['secret:seal', 'secret:decrypt', 'gitops:push'] } })
  document.body.innerHTML = ''
})

/** A detail whose discovered file is where the template does not render. */
function detail(): SealedSecretDetail {
  return {
    name: 'api',
    namespace: 'payments',
    scope: 'strict',
    key_count: 1,
    created_at: '2026-01-01T00:00:00Z',
    git: { managed: true, in_sync_with_live: true, drift: 'in-sync', file_path: REVIEWED, repository: 'org/repo', branch: 'main', base_commit: 'head-1', delivery_mode: 'direct' },
  }
}

/** Puts the panel at the last stage: a dry run has been reviewed. */
function storeAtDeliveryStage(targetPath?: string) {
  const store = useSecretsStore(pinia)
  store.currentDiff = { before: 'before', after: 'after', mutations: [{ key: 'password', operation: 'replace' }], base_commit: 'head-1', checksum: 'sum', target_path: targetPath }
  store.dryRunResult = { before: 'git-before', after: 'after', path: TEMPLATED, base_commit: 'head-1', mode: 'direct' }
  return store
}

function mountPanel(): VueWrapper {
  return mount(DeliveryPanel, { props: { detail: detail() }, global: { plugins: [pinia] } })
}

function deliverButton(wrapper: VueWrapper) {
  return wrapper.findAll('button').find((button) => button.text() === 'Deliver directly')
}

describe('the edit flow names the file it reviewed', () => {
  it('delivers to the path the diff reported, not the templated path', async () => {
    const store = storeAtDeliveryStage(REVIEWED)
    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({ mode: 'direct', commit_sha: 'cafe', argocd_sync_verified: false })

    const wrapper = mountPanel()
    await flushPromises()
    await deliverButton(wrapper)!.trigger('click')
    await flushPromises()

    expect(deliver).toHaveBeenCalledWith('payments', 'api', 'after', 'head-1', REVIEWED)
  })

  it('falls back to the discovered file when the diff carries no path', async () => {
    const store = storeAtDeliveryStage(undefined)
    const deliver = vi.spyOn(store, 'deliver').mockResolvedValue({ mode: 'direct', commit_sha: 'cafe', argocd_sync_verified: false })

    const wrapper = mountPanel()
    await flushPromises()
    await deliverButton(wrapper)!.trigger('click')
    await flushPromises()

    // The detail's file_path is the discovered file too — a client that has a
    // detail and no diff path still must not send the template.
    expect(deliver).toHaveBeenCalledWith('payments', 'api', 'after', 'head-1', REVIEWED)
    expect(deliver).not.toHaveBeenCalledWith('payments', 'api', 'after', 'head-1', TEMPLATED)
  })

  it('runs the dry run against the same reviewed path', async () => {
    const store = useSecretsStore(pinia)
    store.currentDiff = { before: 'before', after: 'after', mutations: [{ key: 'password', operation: 'replace' }], base_commit: 'head-1', checksum: 'sum', target_path: REVIEWED }
    const dryRun = vi.spyOn(store, 'dryRun').mockImplementation(async () => {
      store.dryRunResult = { before: 'git-before', after: 'after', path: REVIEWED, base_commit: 'head-1', mode: 'direct' }
      return store.dryRunResult
    })

    const wrapper = mountPanel()
    await flushPromises()
    const button = wrapper.findAll('button').find((candidate) => candidate.text() === 'Run dry run')
    await button!.trigger('click')
    await flushPromises()

    // The dry run previews the file the delivery will then write. Two different
    // files here would make the review describe a change that is not the one
    // delivered.
    expect(dryRun).toHaveBeenCalledWith('payments', 'api', 'after', 'head-1', REVIEWED)
  })
})
