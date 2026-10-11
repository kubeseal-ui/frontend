// The namespace index. Two things are pinned here: what the fleet shares is stated once in the
// header rather than on every tile, and the tiles answer "how big, and is it healthy" from the one
// cross-namespace listing — the only request in the app that can.
//
// The two toolbar toggles are named sets, not a text box: "the namespaces that are sick" is a
// question the fleet can answer, and typing a namespace's own name to find it is not. They name
// disjoint sets, so they are mutually exclusive rather than cumulative.
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

/** The namespaces the page is listing, read from each tile's own name. */
function rowNames(wrapper: VueWrapper) {
  return wrapper.findAll('a[href^="/namespaces/"] .name').map((name) => name.text())
}

function tile(wrapper: VueWrapper, namespace: string) {
  return wrapper.find(`a[href="/namespaces/${namespace}"]`)
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

    // Grants and destination are the same on every tile, so they are said once, above them.
    expect(wrapper.text()).toContain('Seal and Reveal everywhere, delivering to acme/kube @ main')
  })

  it('leaves the tiles their names and their tally', async () => {
    const wrapper = await mountIndex()

    expect(rowNames(wrapper)).toEqual(['payments', 'platform', 'search'])
    // The bar is decorative; the count beside it is the fact.
    expect(tile(wrapper, 'payments').text()).toContain('2 secrets')
    expect(tile(wrapper, 'platform').text()).toContain('1 secret')
  })

  it('draws the bars in by the names the stylesheet animates by', async () => {
    const wrapper = await mountIndex()

    // `.draw .level .ok` and `.draw .level .bad` are the whole of the tile's entrance. A tile
    // whose segments lost those names still renders a level, and simply appears — the stylesheet
    // is not wrong about anything, it just has nothing left to match.
    expect(wrapper.find('ul.draw').exists()).toBe(true)
    expect(tile(wrapper, 'payments').findAll('.level > i').map((segment) => segment.classes())).toEqual([
      expect.arrayContaining(['ok']),
      expect.arrayContaining(['bad']),
    ])
    // The stagger belongs to the tile, so its delay reaches the segments by inheritance.
    expect(wrapper.find('ul.draw li').attributes('style')).toContain('--d')
  })

  it('counts the namespaces and the Secrets they hold', async () => {
    const wrapper = await mountIndex()

    expect(wrapper.text()).toContain('3 namespaces/4 SealedSecrets')
  })

  it('names what is wrong, and only when something is', async () => {
    const wrapper = await mountIndex()

    expect(wrapper.text()).toContain('1 out of sync in 1 namespace')
    // Healthy tiles are silent, so the sick one is the only mark on the page.
    expect(tile(wrapper, 'payments').text()).toContain('1 drifted')
    expect(tile(wrapper, 'platform').text()).not.toContain('drifted')
  })

  it('says nothing at all when the fleet is clean', async () => {
    const wrapper = await mountIndex([WILDCARD], FLEET, [entry('payments', 'api', 'in-sync')])

    expect(wrapper.text()).not.toContain('out of sync')
    expect(wrapper.text()).not.toContain('drifted')
    // Nothing is out of sync, so the toggle that names the sick ones is not offered.
    expect(buttonWith(wrapper, 'Needs attention')).toBeUndefined()
  })

  it('narrows the list to the namespaces that need attention', async () => {
    const wrapper = await mountIndex()

    const attention = buttonWith(wrapper, 'Needs attention')!
    expect(attention.attributes('aria-pressed')).toBe('false')

    await attention.trigger('click')

    expect(rowNames(wrapper)).toEqual(['payments'])
    expect(buttonWith(wrapper, 'Needs attention')!.attributes('aria-pressed')).toBe('true')

    await buttonWith(wrapper, 'Needs attention')!.trigger('click')
    expect(rowNames(wrapper)).toEqual(['payments', 'platform', 'search'])
  })

  it('keeps the two toggles mutually exclusive, since the sets cannot overlap', async () => {
    // Platform and search hold nothing, so both sets have something to name.
    const wrapper = await mountIndex([WILDCARD], FLEET, [entry('payments', 'queue', 'diverged')])

    await buttonWith(wrapper, 'Empty')!.trigger('click')
    expect(buttonWith(wrapper, 'Empty')!.attributes('aria-pressed')).toBe('true')
    expect(rowNames(wrapper)).toEqual(['platform', 'search'])

    // Pressing the other one is what releases this one: nothing can be both empty and sick.
    await buttonWith(wrapper, 'Needs attention')!.trigger('click')
    expect(buttonWith(wrapper, 'Needs attention')!.attributes('aria-pressed')).toBe('true')
    expect(buttonWith(wrapper, 'Empty')!.attributes('aria-pressed')).toBe('false')
    expect(rowNames(wrapper)).toEqual(['payments'])
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
    // is read from the tiles rather than from the store's empty list.
    expect(wrapper.text()).not.toContain('0 namespaces')
  })

  it("keeps a tile's own destination on the tile when the fleet does not agree", async () => {
    const wrapper = await mountIndex([OWN_MAPPING, WILDCARD])

    // Payments delivers from its own repository, so its tile names it rather than inheriting the
    // header's. A fact no tile shares is not stated above them.
    expect(tile(wrapper, 'payments').text()).toContain('acme/payments-config @ release')
    expect(wrapper.text()).not.toContain('delivers to acme/kube')
    expect(wrapper.text()).not.toContain('delivering to acme/kube')
  })

  it('says a namespace holds none rather than counting zero', async () => {
    const wrapper = await mountIndex([WILDCARD], FLEET, [entry('payments', 'api', 'in-sync')])

    // A zero is a tally; holding nothing is a state, and the tile names it in words.
    expect(tile(wrapper, 'platform').text()).toContain('no secrets')
  })

  it('leaves a lone namespace its count on its own tile', async () => {
    const wrapper = await mountIndex([WILDCARD], [FLEET[0]], [entry('payments', 'api', 'in-sync')])

    // One namespace is still a tally, not a sentence: the header counts it the same way.
    expect(wrapper.text()).toContain('1 namespace/1 SealedSecrets')
    expect(tile(wrapper, 'payments').text()).toContain('1 secret')
  })
})
