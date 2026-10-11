// The namespace ledger: identity in one column, contents in the other. The counts come from the
// listing the page already renders, so these also pin that the summary costs no second request.
// The constants of the namespace — scope, and the state they all share — are stated once in the
// header, which is what leaves the one row that differs as the only mark on the list.
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
  return wrapper.findAll('li h2').map((heading) => heading.text())
}

function row(wrapper: VueWrapper, name: string) {
  return wrapper.findAll('li').find((item) => item.find('h2').exists() && item.find('h2').text() === name)!
}

describe('the namespace ledger', () => {
  it('summarises the namespace from the listing it already has', async () => {
    const { wrapper, get } = await mountNamespaceView()

    // One request, and it is the listing itself.
    expect(get).toHaveBeenCalledTimes(1)
    expect(wrapper.text()).toContain('6 SealedSecrets · 12 keys · strict scope · 3 out of sync')
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

  it('names the keys inside a Secret, which a search result has no room for', async () => {
    const { wrapper } = await mountNamespaceView([
      summary('api', 'in-sync', { keys: ['DATABASE_URL', 'STRIPE_SECRET'], key_count: 2 }),
    ])

    const text = row(wrapper, 'api').text()
    expect(text).toContain('DATABASE_URL')
    expect(text).toContain('STRIPE_SECRET')
  })

  it('names the keys it did not have room for rather than dropping them', async () => {
    const many = Array.from({ length: 12 }, (_, index) => `KEY_${index}`)
    const { wrapper } = await mountNamespaceView([
      summary('api', 'in-sync', { keys: many, key_count: 12 }),
    ])

    const text = row(wrapper, 'api').text()
    expect(text).toContain('KEY_0')
    expect(text).toContain('KEY_7')
    // The ninth is over the cap, and its absence is stated rather than silent.
    expect(text).not.toContain('KEY_8')
    expect(text).toContain('+4')
    expect(text).toContain('4 more keys')
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
