// The drift rollup and the filter it doubles as. The counts come from the listing the
// page already renders, so these checks also pin that the summary costs no second request.
// The rows are the rail's list rendered as a page, so they are flat rather than cards; the
// rollup, the filter and the counts are unchanged.
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

function summary(name: string, drift: GitState['drift']): SealedSecretSummary {
  return {
    name,
    namespace: 'payments',
    scope: 'strict',
    key_count: 2,
    created_at: '2026-09-01T00:00:00Z',
    git: { managed: true, in_sync_with_live: drift === 'in-sync', drift, file_path: `clusters/payments/${name}.yaml` },
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

function cardNames(wrapper: VueWrapper) {
  return wrapper.findAll('li h2').map((heading) => heading.text())
}

describe('namespace drift rollup', () => {
  it('summarises every drift state from the listing it already has', async () => {
    const { wrapper, get } = await mountNamespaceView()

    expect(get).toHaveBeenCalledTimes(1)
    expect(chipCount(wrapper, 'All')).toBe('6')
    expect(chipCount(wrapper, 'In sync')).toBe('3')
    expect(chipCount(wrapper, 'Out of sync')).toBe('3')
  })

  it('starts unfiltered and shows all three states as words, not colour alone', async () => {
    const { wrapper } = await mountNamespaceView()

    expect(cardNames(wrapper)).toHaveLength(6)
    expect(chip(wrapper, 'All')!.attributes('aria-pressed')).toBe('true')
    expect(wrapper.text()).toContain('Diverged')
    expect(wrapper.text()).toContain('Live only')
    expect(wrapper.text()).toContain('Git only')
  })

  it('counts keys correctly at one and names what the scope is', async () => {
    const { wrapper } = await mountNamespaceView([{ ...summary('api', 'in-sync'), key_count: 1, scope: 'namespace-wide' }])

    expect(wrapper.text()).toContain('1 key · namespace-wide scope')
    expect(wrapper.text()).not.toContain('1 keys')
  })

  it('filters to the Secrets that are out of sync', async () => {
    const { wrapper } = await mountNamespaceView()

    await chip(wrapper, 'Out of sync')!.trigger('click')

    expect(cardNames(wrapper)).toEqual(['cache', 'events', 'queue'])
    expect(chip(wrapper, 'Out of sync')!.attributes('aria-pressed')).toBe('true')
    expect(chip(wrapper, 'All')!.attributes('aria-pressed')).toBe('false')
  })

  it('filters to the Secrets that are in sync', async () => {
    const { wrapper } = await mountNamespaceView()

    await chip(wrapper, 'In sync')!.trigger('click')

    expect(cardNames(wrapper)).toEqual(['api', 'billing', 'db'])
  })

  it('returns to every Secret when the filter is cleared', async () => {
    const { wrapper } = await mountNamespaceView()

    await chip(wrapper, 'Out of sync')!.trigger('click')
    await chip(wrapper, 'All')!.trigger('click')

    expect(cardNames(wrapper)).toHaveLength(6)
  })

  it('explains a filter that matches nothing', async () => {
    const { wrapper } = await mountNamespaceView([summary('api', 'in-sync')])

    await chip(wrapper, 'Out of sync')!.trigger('click')

    expect(cardNames(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toContain('No SealedSecrets are out of sync')
  })

  it('withholds the summary from an empty namespace', async () => {
    const { wrapper } = await mountNamespaceView([])

    expect(wrapper.findAll('button').filter((button) => button.attributes('aria-pressed') !== undefined)).toHaveLength(0)
    expect(wrapper.text()).toContain('No SealedSecrets in this namespace')
  })
})
