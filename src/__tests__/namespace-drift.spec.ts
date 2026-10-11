// The namespace ledger: identity in one column, contents in the other. The counts come from the
// listing the page already renders, so these also pin that the summary costs no second request.
// The constants of the namespace — scope, and the state they all share — are stated once in the
// header, which is what leaves the one row that differs as the only mark on the list.
//
// What the ledger deliberately does NOT carry is a Secret's key names. It lists every Secret the
// account can reach, so printing the keys would publish the shape of the whole credential store
// to anyone who can load the page. The keys are on the Secret's own screen, behind opening it,
// and in ⌘K results, which are a question the operator asked rather than a list they were handed.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { router } from '@/router'
import { pinia } from '@/pinia'
import { api } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import NamespaceView from '@/views/NamespaceView.vue'
import type { Capability, GitState, SealedSecretSummary } from '@/types'

function summary(
  name: string,
  drift: GitState['drift'],
  overrides: Partial<SealedSecretSummary> = {},
): SealedSecretSummary {
  return {
    name,
    namespace: 'payments',
    scope: 'strict',
    keys: ['DATABASE_URL', 'PASSWORD'],
    key_count: 2,
    created_at: '2026-09-01T00:00:00Z',
    git: { managed: true, in_sync_with_live: drift === 'in-sync', drift, file_path: `clusters/payments/${name}.yaml` },
    ...overrides,
  }
}

const SECRETS: SealedSecretSummary[] = [
  summary('api', 'in-sync'),
  summary('billing', 'in-sync'),
  summary('cache', 'diverged'),
  summary('db', 'in-sync'),
  summary('events', 'live_only'),
  summary('queue', 'git_only'),
]

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  useAuthStore(pinia).setSession({
    email: 'u@example.com', name: 'User', username: 'u',
    namespaces: { payments: ['metadata:read'] as Capability[] },
  })
  document.body.innerHTML = ''
})

async function mountNamespaceView(secrets: SealedSecretSummary[] = SECRETS) {
  const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { secrets } } as never)
  const wrapper = mount(NamespaceView, { props: { namespace: 'payments' }, global: { plugins: [pinia, router] } })
  await flushPromises()
  return { wrapper, get }
}

function chip(wrapper: VueWrapper, label: string) {
  return wrapper.findAll('button').find((button) => button.text().startsWith(label))
}

// Read from the count's own node: the button's text carries the template's line breaks.
function chipCount(wrapper: VueWrapper, label: string) {
  return chip(wrapper, label)!.find('span').text()
}

function rowNames(wrapper: VueWrapper) {
  return wrapper.findAll('li .name').map((name) => name.text())
}

function row(wrapper: VueWrapper, name: string) {
  return wrapper.findAll('li').find((item) => item.find('.name').exists() && item.find('.name').text() === name)!
}

describe('the namespace ledger', () => {
  it('summarises the namespace from the listing it already has', async () => {
    const { wrapper, get } = await mountNamespaceView()

    // The facts are a flex row, so the separators sit against their neighbours with the spacing
    // supplied by the layout rather than by a space in the markup.
    expect(wrapper.text()).toContain('6 SealedSecrets/12 keys/strict scope/3 out of sync')
    // One request for what this page lists. The switcher above it asks for the fleet, which is a
    // different question and is not scoped to this namespace.
    const scoped = get.mock.calls.filter(([path]) => String(path).includes('namespace=payments'))
    expect(scoped).toHaveLength(1)
  })

  it('forces a re-fetch on Refresh, where the cached listing would not reload', async () => {
    const { wrapper, get } = await mountNamespaceView()
    const scoped = () => get.mock.calls.filter(([path]) => String(path).includes('namespace=payments')).length
    const before = scoped()

    await wrapper.findAll('button').find((button) => button.text().includes('Refresh'))!.trigger('click')
    await flushPromises()

    // ensureSecrets returns the cached listing once loaded, so Refresh must bypass it; otherwise the
    // button does nothing on exactly the already-loaded page where someone presses it for fresh drift.
    expect(scoped()).toBeGreaterThan(before)
  })

  it('lists every Secret, and names each state in words rather than colour alone', async () => {
    const { wrapper } = await mountNamespaceView()

    expect(rowNames(wrapper)).toHaveLength(6)
    expect(wrapper.text()).toContain('Diverged')
    expect(wrapper.text()).toContain('Live only')
    expect(wrapper.text()).toContain('Git only')
  })

  it('wears a chip only on the rows that differ from the namespace', async () => {
    const { wrapper } = await mountNamespaceView()

    // Three of the six drifted, and those three are the only rows carrying a state chip.
    expect(row(wrapper, 'cache').text()).toContain('Diverged')
    expect(row(wrapper, 'api').text()).not.toContain('In sync')
    expect(row(wrapper, 'api').text()).not.toContain('Diverged')
  })

  it('never prints a key name, however many keys the Secret holds', async () => {
    const { wrapper } = await mountNamespaceView([
      summary('api', 'in-sync', { keys: ['DATABASE_URL', 'STRIPE_SECRET'], key_count: 2 }),
    ])

    const text = row(wrapper, 'api').text()
    expect(text).not.toContain('DATABASE_URL')
    expect(text).not.toContain('STRIPE_SECRET')
  })

  it('says how many keys it is not naming rather than naming them', async () => {
    const many = Array.from({ length: 12 }, (_, index) => `KEY_${index}`)
    const { wrapper } = await mountNamespaceView([
      summary('api', 'in-sync', { keys: many, key_count: 12 }),
    ])

    const text = row(wrapper, 'api').text()
    expect(text).toContain('12 keys')
    for (const key of many) expect(text).not.toContain(key)
  })

  it('counts one key as one key', async () => {
    const { wrapper } = await mountNamespaceView([
      { ...summary('api', 'in-sync'), keys: ['TOKEN'], key_count: 1, scope: 'namespace-wide' },
    ])

    expect(wrapper.text()).toContain('1 key')
    expect(wrapper.text()).not.toContain('1 keys')
  })

  it('filters to the Secrets that are out of sync', async () => {
    const { wrapper } = await mountNamespaceView()

    await chip(wrapper, 'Out of sync')!.trigger('click')

    expect(rowNames(wrapper)).toEqual(['cache', 'events', 'queue'])
    expect(chip(wrapper, 'Out of sync')!.attributes('aria-pressed')).toBe('true')
    expect(chip(wrapper, 'All')!.attributes('aria-pressed')).toBe('false')
    expect(chipCount(wrapper, 'Out of sync')).toBe('3')
  })

  it('filters to the Secrets that are in sync', async () => {
    const { wrapper } = await mountNamespaceView()

    await chip(wrapper, 'In sync')!.trigger('click')

    expect(rowNames(wrapper)).toEqual(['api', 'billing', 'db'])
  })

  it('returns to every Secret when the filter is cleared', async () => {
    const { wrapper } = await mountNamespaceView()

    await chip(wrapper, 'Out of sync')!.trigger('click')
    await chip(wrapper, 'All')!.trigger('click')

    expect(rowNames(wrapper)).toHaveLength(6)
  })

  it('withholds the filter when there is one state to choose between', async () => {
    const { wrapper } = await mountNamespaceView([summary('api', 'in-sync')])

    // A filter that cannot exclude anything is three buttons the header has already answered.
    expect(wrapper.findAll('button').filter((button) => button.attributes('aria-pressed') !== undefined)).toHaveLength(0)
    expect(wrapper.text()).toContain('all in sync')
  })

  it('withholds the summary and the filter from an empty namespace', async () => {
    const { wrapper } = await mountNamespaceView([])

    expect(wrapper.findAll('button').filter((button) => button.attributes('aria-pressed') !== undefined)).toHaveLength(0)
    expect(wrapper.text()).toContain('No SealedSecrets in this namespace')
  })
})
