// The rail and the search box. Two things are worth pinning here: that the rail costs one listing
// and not one per namespace, and that the search index is built lazily and never from plaintext.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { pinia } from '@/pinia'
import { router } from '@/router'
import { api } from '@/api'
import NamespaceRail from '@/components/NamespaceRail.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { useUiStore } from '@/stores/ui'
import { searchSecrets } from '@/utils/searchIndex'
import type { Capability, GitState, Namespace, SealedSecretSummary } from '@/types'

function summary(namespace: string, name: string, overrides: Partial<SealedSecretSummary> = {}): SealedSecretSummary {
  const drift: GitState['drift'] = 'in-sync'
  return {
    name,
    namespace,
    scope: 'strict',
    keys: [],
    key_count: 1,
    created_at: '2026-09-01T00:00:00Z',
    git: { managed: true, in_sync_with_live: true, drift, file_path: `clusters/${namespace}/${name}.yaml` },
    ...overrides,
  }
}

const PAYMENTS: SealedSecretSummary[] = [
  summary('payments', 'api', { keys: ['DATABASE_URL', 'password'], key_count: 2 }),
  summary('payments', 'queue', { git: { managed: true, in_sync_with_live: false, drift: 'diverged', file_path: 'clusters/payments/queue.yaml' } }),
]

const NAMESPACES: Namespace[] = [
  { name: 'payments', capabilities: ['metadata:read'] as Capability[] },
  { name: 'platform', capabilities: ['metadata:read'] as Capability[] },
]

// Everything the caller holds metadata:read in, across namespaces — what the index is built from.
const INDEX: SealedSecretSummary[] = [...PAYMENTS, summary('platform', 'database-urls', { keys: ['DATABASE_URL', 'pool'], key_count: 2 })]

/** Bodies by path, so a test reads as the requests the rail is allowed to make. */
function serve(namespaces: Namespace[] = NAMESPACES, scoped: SealedSecretSummary[] = PAYMENTS, index: SealedSecretSummary[] = INDEX) {
  return vi.spyOn(api, 'get').mockImplementation((async (path: string) => {
    if (path === '/api/v1/namespaces') return { data: { namespaces } }
    if (path === '/api/v1/secrets') return { data: { secrets: index } }
    return { data: { secrets: scoped } }
  }) as never)
}

const scopedListingCalls = (get: ReturnType<typeof serve>) =>
  get.mock.calls.filter(([path]) => String(path).startsWith('/api/v1/secrets?')).length

beforeEach(async () => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  useUiStore(pinia).closeRail()
  useAuthStore(pinia).setSession({
    email: 'u@example.com', name: 'User', username: 'u',
    namespaces: { payments: ['metadata:read'] as Capability[], platform: ['metadata:read'] as Capability[] },
  })
  document.body.innerHTML = ''
  await router.push('/secrets/payments/api')
})

async function mountRail(attach = false) {
  const wrapper = mount(NamespaceRail, {
    ...(attach ? { attachTo: document.body } : {}),
    global: { plugins: [pinia, router] },
  })
  await flushPromises()
  return wrapper
}

describe('matching a query against the index', () => {
  it('finds a Secret by its name', () => {
    expect(searchSecrets(INDEX, 'queue').map((hit) => hit.name)).toEqual(['queue'])
  })

  it('finds a Secret by a key name and says which key matched', () => {
    // Two Secrets hold DATABASE_URL. Answering with one, or with neither name, would make the
    // row look like an accident rather than a match.
    const hits = searchSecrets(INDEX, 'database_url')
    expect(hits.map((hit) => `${hit.namespace}/${hit.name}`)).toEqual(['payments/api', 'platform/database-urls'])
    expect(hits.map((hit) => hit.matchedKeys)).toEqual([['DATABASE_URL'], ['DATABASE_URL']])
  })

  it('matches case-insensitively and ignores surrounding space', () => {
    expect(searchSecrets(INDEX, '  QuEuE  ').map((hit) => hit.name)).toEqual(['queue'])
  })

  it('carries the key count and the drift a row renders', () => {
    const [hit] = searchSecrets(INDEX, 'queue')
    expect(hit.key_count).toBe(1)
    expect(hit.drift).toBe('diverged')
  })

  it('offers nothing for an empty query rather than the whole index', () => {
    expect(searchSecrets(INDEX, '   ')).toEqual([])
  })
})

describe('the rail', () => {
  it('lists the namespaces the caller is authorized in', async () => {
    serve()
    const wrapper = await mountRail()

    expect(wrapper.text()).toContain('payments')
    expect(wrapper.text()).toContain('platform')
  })

  it('opens the active namespace and states which Secrets drifted', async () => {
    serve()
    const wrapper = await mountRail()

    // The active namespace's Secrets, with the drift as a word and not colour alone.
    expect(wrapper.text()).toContain('api')
    expect(wrapper.text()).toContain('queue')
    expect(wrapper.text()).toContain('Diverged')
    expect(wrapper.text()).toContain('In sync')
  })

  it('costs one listing, not one per namespace', async () => {
    const get = serve()
    await mountRail()

    // Only the active namespace is listed. A tree that fetched every namespace's Secrets would
    // pay for the whole cluster to render the one branch that is open.
    expect(scopedListingCalls(get)).toBe(1)
    expect(get).toHaveBeenCalledWith('/api/v1/secrets?namespace=payments')
  })

  it('says so when the account holds no namespace grant', async () => {
    serve([])
    const wrapper = await mountRail()

    expect(wrapper.text()).toContain('No authorized namespaces')
  })

  it('survives a listing that fails, because it is chrome around the route', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('offline') as never)
    const wrapper = await mountRail()

    // The page that owns the route reports the failure; the rail must not take the route down.
    expect(wrapper.find('#secret-search').exists()).toBe(true)
  })
})

describe('search in the rail', () => {
  it('builds the index on first use, not on page load', async () => {
    const get = serve()
    const rail = await mountRail()

    // The unscoped listing is the whole authorized cluster, so it waits to be asked for.
    expect(get.mock.calls.filter(([path]) => path === '/api/v1/secrets')).toHaveLength(0)
    expect(useSecretsStore(pinia).indexLoaded).toBe(false)

    await rail.find('#secret-search').trigger('focus')
    await flushPromises()

    expect(get.mock.calls.filter(([path]) => path === '/api/v1/secrets')).toHaveLength(1)
  })

  it('replaces the tree with matches from every namespace', async () => {
    serve()
    const wrapper = await mountRail()

    await wrapper.find('#secret-search').setValue('database_url')
    await flushPromises()

    // Namespaced paths, so the same Secret name in two namespaces is two destinations.
    expect(wrapper.find('a[href="/secrets/payments/api"]').exists()).toBe(true)
    expect(wrapper.find('a[href="/secrets/platform/database-urls"]').exists()).toBe(true)
    // The matched key is named, so the row says why it is in the list.
    expect(wrapper.text()).toContain('DATABASE_URL')
    // The namespace tree is gone while a query is active.
    expect(wrapper.find('a[href="/namespaces/platform"]').exists()).toBe(false)
  })

  it('counts the namespaces the server returned, not the ones that exist', async () => {
    // platform is authorized but holds no Secret, so the listing came back narrower than the tree.
    serve(NAMESPACES, PAYMENTS, PAYMENTS)
    const wrapper = await mountRail()

    await wrapper.find('#secret-search').setValue('api')
    await flushPromises()

    expect(wrapper.text()).toContain('Secrets found in 1 of your 2 namespaces')
  })

  it('keeps the rail usable when the index cannot be built', async () => {
    vi.spyOn(api, 'get').mockImplementation((async (path: string) => {
      if (path === '/api/v1/secrets') throw new Error('gateway')
      if (path === '/api/v1/namespaces') return { data: { namespaces: NAMESPACES } }
      return { data: { secrets: PAYMENTS } }
    }) as never)

    const wrapper = await mountRail()
    await wrapper.find('#secret-search').trigger('focus')
    await flushPromises()

    const store = useSecretsStore(pinia)
    expect(store.indexLoaded).toBe(false)
    expect(store.indexError).toBeInstanceOf(Error)
    // The failure is stated where the search is, and the tree is untouched by it.
    expect(wrapper.text()).toContain('search index could not be loaded')
    expect(wrapper.text()).toContain('payments')
  })

  it('answers the header control by opening the box', async () => {
    serve()
    const wrapper = await mountRail(true)

    useUiStore(pinia).openRail(true)
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.find('#secret-search').element)
  })
})
