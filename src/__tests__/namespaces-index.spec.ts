// The namespace index: what every namespace shares is stated once above the list, and the rows
// carry only what is left. These pin that collapse — a fact withheld from a row has to appear
// above it, or it is lost — along with the count and the filter that makes a long list scannable.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { router } from '@/router'
import { pinia } from '@/pinia'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import HomeView from '@/views/HomeView.vue'
import type { Capability, Namespace, NamespaceGitPaths } from '@/types'

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

function session(namespaces: Record<string, Capability[]>) {
  useAuthStore(pinia).setSession({ email: 'u@example.com', name: 'User', username: 'u', namespaces })
}

async function mountIndex(paths: NamespaceGitPaths[] = [WILDCARD], namespaces: Namespace[] = FLEET) {
  vi.spyOn(api, 'get').mockImplementation((async (path: string) => {
    if (path === '/api/v1/namespaces') return { data: { namespaces } }
    if (path === '/api/v1/gitops/paths') return { data: { namespaces: paths } }
    return { data: {} }
  }) as never)

  const wrapper = mount(HomeView, { global: { plugins: [pinia, router] } })
  await flushPromises()
  return wrapper
}

/** Each namespace row's own text, which is what the row is claiming about that namespace. */
function rowTexts(wrapper: VueWrapper) {
  return wrapper.findAll('a[href^="/namespaces/"]').map((link) => link.text())
}

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  session({ payments: EVERYTHING, platform: EVERYTHING, search: EVERYTHING })
  document.body.innerHTML = ''
})

describe('the namespace index', () => {
  it('states the shared destination and grants once, and leaves the rows their names', async () => {
    const wrapper = await mountIndex()

    expect(wrapper.text()).toContain('Every namespace delivers straight to acme/kube @ main and grants Seal and Reveal.')
    // Not one chip per row: the rows are the names and nothing they all share.
    expect(rowTexts(wrapper)).toEqual(['payments', 'platform', 'search'])
  })

  it('counts the namespaces above the list', async () => {
    const wrapper = await mountIndex()

    expect(wrapper.text()).toContain('3 namespaces')
  })

  it('states a listing that failed rather than counting nothing', async () => {
    vi.spyOn(api, 'get').mockImplementation((async (path: string) => {
      if (path === '/api/v1/namespaces') throw new Error('gateway')
      if (path === '/api/v1/gitops/paths') return { data: { namespaces: [WILDCARD] } }
      return { data: {} }
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

    expect(wrapper.text()).not.toContain('Every namespace')
    // Payments delivers by proposal from its own repository, so its row says so itself.
    const payments = wrapper.find('a[href="/namespaces/payments"]')
    expect(payments.text()).toContain('Seal')
    expect(payments.text()).toContain('acme/payments-config @ release')
    expect(payments.text()).toContain('1 directory · proposal')
    // Read-only is a fact about this namespace alone, so it stays on its row.
    expect(wrapper.find('a[href="/namespaces/platform"]').text()).toContain('Read only')
  })

  it('leaves a lone namespace its facts on its own row', async () => {
    const wrapper = await mountIndex([WILDCARD], [FLEET[0]])

    // One row is not a repetition to collapse, and "every namespace" would be describing one.
    expect(wrapper.text()).not.toContain('Every namespace')
    expect(wrapper.text()).toContain('1 namespace')
    expect(wrapper.find('a[href="/namespaces/payments"]').text()).toContain('Seal')
    expect(wrapper.find('input[aria-label="Filter namespaces"]').exists()).toBe(false)
  })

  it('filters the list by name and says how much survived', async () => {
    const wrapper = await mountIndex()

    await wrapper.find('input[aria-label="Filter namespaces"]').setValue('plat')
    await flushPromises()

    expect(rowTexts(wrapper)).toEqual(['platform'])
    expect(wrapper.text()).toContain('Showing 1 of 3 namespaces.')
    // The shared facts are the page's, not the filter's: they stay whatever the query is.
    expect(wrapper.text()).toContain('Every namespace delivers straight to acme/kube @ main')
  })

  it('returns every namespace when the filter is cleared', async () => {
    const wrapper = await mountIndex()

    await wrapper.find('input[aria-label="Filter namespaces"]').setValue('plat')
    await wrapper.find('input[aria-label="Filter namespaces"]').setValue('')

    expect(rowTexts(wrapper)).toEqual(['payments', 'platform', 'search'])
  })

  it('says a filter matched nothing rather than rendering an empty list', async () => {
    const wrapper = await mountIndex()

    await wrapper.find('input[aria-label="Filter namespaces"]').setValue('nope')

    expect(rowTexts(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('No namespace matches')
    expect(wrapper.text()).toContain('nope')
  })
})
