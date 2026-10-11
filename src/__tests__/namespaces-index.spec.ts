// The namespace index. Two things are pinned here: what the fleet shares is stated once in the
// header rather than on every row, and the rows answer "how big, and is it healthy" from the one
// cross-namespace listing — the only request in the app that can.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { router } from '@/router'
import { pinia } from '@/pinia'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import HomeView from '@/views/HomeView.vue'
import type { Capability, GitState, Namespace, NamespaceGitPaths, SealedSecretSummary } from '@/types'

const FLEET: Namespace[] = [
  { name: 'payments', capabilities: [] },
  { name: 'platform', capabilities: [] },
  { name: 'search', capabilities: [] },
]

// One wildcard mapping covering every namespace, which is what makes the fleet uniform.
const WILDCARD: NamespaceGitPaths = {
  namespace: '*',
  path_template: 'apps/{namespace}/{name}.yaml',
  allowed_paths: [],
  repository: 'acme/kube',
  branch: 'main',
  mode: 'direct',
}

// Payments departs from the wildcard on both the destination and the mode.
const OWN_MAPPING: NamespaceGitPaths = {
  namespace: 'payments',
  path_template: 'payments/{name}.yaml',
  allowed_paths: ['payments/'],
  repository: 'acme/payments-config',
  branch: 'release',
  mode: 'proposal',
}

const EVERYTHING: Capability[] = ['metadata:read', 'secret:seal', 'secret:decrypt']

function entry(namespace: string, name: string, drift: GitState['drift']): SealedSecretSummary {
  return {
    name,
    namespace,
    keys: ['TOKEN'],
    key_count: 1,
    scope: 'strict',
    created_at: '2026-09-01T00:00:00Z',
    git: { managed: true, in_sync_with_live: drift === 'in-sync', drift },
  }
}

// One namespace is sick; the other two are not.
const INDEX: SealedSecretSummary[] = [
  entry('payments', 'api', 'in-sync'),
  entry('payments', 'queue', 'diverged'),
  entry('platform', 'database-urls', 'in-sync'),
  entry('search', 'crawler', 'in-sync'),
]

function session(namespaces: Record<string, Capability[]>) {
  useAuthStore(pinia).setSession({ email: 'u@example.com', name: 'User', username: 'u', namespaces })
}

async function mountIndex(
  paths: NamespaceGitPaths[] = [WILDCARD],
  namespaces: Namespace[] = FLEET,
  index: SealedSecretSummary[] = INDEX,
) {
  vi.spyOn(api, 'get').mockImplementation((async (path: string) => {
    if (path === '/api/v1/namespaces') return { data: { namespaces } }
    if (path === '/api/v1/gitops/paths') return { data: { namespaces: paths } }
    if (path === '/api/v1/secrets') return { data: { secrets: index } }
    return { data: {} }
  }) as never)

  const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

/** The namespaces the page is listing, read from each row's own heading. */
function rowNames(wrapper: VueWrapper) {
  return wrapper.findAll('a[href^="/namespaces/"] h2').map((heading) => heading.text())
}

function buttonWith(wrapper: VueWrapper, text: string) {
  return wrapper.findAll('button').find((button) => button.text().includes(text))
}

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  session({ payments: EVERYTHING, platform: EVERYTHING, search: EVERYTHING })
  document.body.innerHTML = ''
})

describe('the namespace index', () => {
  it('states the fleet’s delivery policy once, in the header', async () => {
    const wrapper = await mountIndex()

    expect(wrapper.text()).toContain('delivers to acme/kube @ main · Seal, Reveal')
  })

  it('leaves the rows their names and their tally', async () => {
    const wrapper = await mountIndex()

    expect(rowNames(wrapper)).toEqual(['payments', 'platform', 'search'])
    // The bar is decorative; the count beside it is the fact.
    const payments = wrapper.find('a[href="/namespaces/payments"]')
    expect(payments.text()).toContain('2 secrets')
    expect(wrapper.find('a[href="/namespaces/platform"]').text()).toContain('1 secret')
  })

  it('counts the namespaces and the Secrets they hold', async () => {
    const wrapper = await mountIndex()

    expect(wrapper.text()).toContain('3 namespaces · 4 SealedSecrets')
  })

  it('names what is wrong, and only when something is', async () => {
    const wrapper = await mountIndex()

    expect(wrapper.text()).toContain('1 SealedSecret out of sync in 1 namespace')
    // Healthy rows are silent, so the sick one is the only mark on the page.
    expect(wrapper.find('a[href="/namespaces/payments"]').text()).toContain('1 out of sync')
    expect(wrapper.find('a[href="/namespaces/platform"]').text()).not.toContain('out of sync')
  })

  it('says nothing at all when the fleet is clean', async () => {
    const wrapper = await mountIndex([WILDCARD], FLEET, [entry('payments', 'api', 'in-sync')])

    expect(wrapper.text()).not.toContain('out of sync')
  })

  it('narrows the list to the namespaces that need attention', async () => {
    const wrapper = await mountIndex()

    const attention = buttonWith(wrapper, 'out of sync')!
    expect(attention.attributes('aria-pressed')).toBe('false')

    await attention.trigger('click')

    expect(rowNames(wrapper)).toEqual(['payments'])
    expect(buttonWith(wrapper, 'out of sync')!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('Show all')

    await buttonWith(wrapper, 'out of sync')!.trigger('click')
    expect(rowNames(wrapper)).toEqual(['payments', 'platform', 'search'])
  })

  it('states a listing that failed rather than counting nothing', async () => {
    vi.spyOn(api, 'get').mockImplementation((async (path: string) => {
      if (path === '/api/v1/namespaces') throw new Error('gateway')
      if (path === '/api/v1/gitops/paths') return { data: { namespaces: [WILDCARD] } }
      return { data: { secrets: INDEX } }
    }) as never)

    const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } })
    await flushPromises()

    expect(wrapper.text()).toContain('Unable to load namespaces')
    // Zero counts a listing that arrived. One that failed has no count to state, and the count
    // is read from the rows rather than from the store's empty list.
    expect(wrapper.text()).not.toContain('0 namespaces')
  })

  it("keeps a row's own facts on the row when the fleet does not agree", async () => {
    session({ payments: EVERYTHING, platform: ['metadata:read'], search: EVERYTHING })
    const wrapper = await mountIndex([OWN_MAPPING, WILDCARD])

    // Payments delivers by proposal from its own repository, so its row says so itself.
    const payments = wrapper.find('a[href="/namespaces/payments"]')
    expect(payments.text()).toContain('Seal')
    expect(payments.text()).toContain('acme/payments-config @ release')
    expect(payments.text()).toContain('1 directory · proposal')
    // Read-only is a fact about this namespace alone, so it stays on its row.
    expect(wrapper.find('a[href="/namespaces/platform"]').text()).toContain('Read only')
    // A fact no row shares is not stated above them.
    expect(wrapper.text()).not.toContain('delivers to acme/kube')
  })

  it('leaves a lone namespace its facts on its own row', async () => {
    const wrapper = await mountIndex([WILDCARD], [FLEET[0]], [entry('payments', 'api', 'in-sync')])

    // One row is not a repetition to collapse, and "every namespace" would be describing one.
    expect(wrapper.text()).not.toContain('delivers to')
    expect(wrapper.text()).toContain('1 namespace')
    expect(wrapper.find('a[href="/namespaces/payments"]').text()).toContain('Seal')
    expect(wrapper.find('input[aria-label="Filter namespaces"]').exists()).toBe(false)
  })

  it('filters the list by name and says how much survived', async () => {
    const wrapper = await mountIndex()

    await wrapper.find('input[aria-label="Filter namespaces"]').setValue('plat')
    await flushPromises()

    expect(rowNames(wrapper)).toEqual(['platform'])
    expect(wrapper.text()).toContain('Showing 1 of 3 namespaces.')
    // The shared policy is the page's, not the filter's: it stays whatever the query is.
    expect(wrapper.text()).toContain('delivers to acme/kube @ main')
  })

  it('returns every namespace when the filter is cleared', async () => {
    const wrapper = await mountIndex()

    await wrapper.find('input[aria-label="Filter namespaces"]').setValue('plat')
    await wrapper.find('input[aria-label="Filter namespaces"]').setValue('')

    expect(rowNames(wrapper)).toEqual(['payments', 'platform', 'search'])
  })

  it('says a filter matched nothing rather than rendering an empty list', async () => {
    const wrapper = await mountIndex()

    await wrapper.find('input[aria-label="Filter namespaces"]').setValue('nope')

    expect(rowNames(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('No namespace matches')
    expect(wrapper.text()).toContain('nope')
  })
})
