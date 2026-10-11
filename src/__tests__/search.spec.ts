// The search index and the panel that renders it. Names and key names only — the cross-namespace
// listing carries no values — so these also pin that answering a query costs no second request.
//
// This file replaces namespace-rail.spec.ts: the rail is gone, and the search it held now lives in
// the top strip and replaces the page below it.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia } from 'pinia'
import { router } from '@/router'
import { pinia } from '@/pinia'
import SearchResults from '@/components/SearchResults.vue'
import { useSecretsStore } from '@/stores/secrets'
import { highlightSegments, searchSecrets } from '@/utils/searchIndex'
import type { GitState, SealedSecretSummary } from '@/types'

function summary(
  namespace: string,
  name: string,
  keys: string[],
  drift: GitState['drift'] = 'in-sync',
): SealedSecretSummary {
  return {
    name,
    namespace,
    keys,
    key_count: keys.length,
    scope: 'strict',
    created_at: '2026-09-01T00:00:00Z',
    git: { managed: true, in_sync_with_live: drift === 'in-sync', drift },
  }
}

const INDEX: SealedSecretSummary[] = [
  summary('payments', 'api', ['DATABASE_URL', 'STRIPE_SECRET']),
  summary('payments', 'queue', ['REDIS_URL']),
  summary('platform', 'database-urls', ['DATABASE_URL'], 'diverged'),
]

function mountResults(query: string, index: SealedSecretSummary[] = INDEX, loaded = true) {
  const store = useSecretsStore(pinia)
  store.index = index
  store.indexLoaded = loaded
  return mount(SearchResults, { props: { query }, global: { plugins: [pinia, router] } })
}

beforeEach(() => {
  setActivePinia(pinia)
  vi.restoreAllMocks()
  useSecretsStore(pinia).$reset()
  document.body.innerHTML = ''
})

describe('the search index', () => {
  it('matches a Secret by name', () => {
    expect(searchSecrets(INDEX, 'queue').map((hit) => hit.name)).toEqual(['queue'])
  })

  it('matches a Secret by a key name, and says which key', () => {
    // A hit that matched on a key is otherwise inexplicable: the row's own name contains nothing
    // the operator typed.
    const hits = searchSecrets(INDEX, 'stripe')

    expect(hits).toHaveLength(1)
    expect(hits[0].name).toBe('api')
    expect(hits[0].matchedKeys).toEqual(['STRIPE_SECRET'])
  })

  it('carries the state a row needs to say whether the Secret has drifted', () => {
    expect(searchSecrets(INDEX, 'database-urls')[0]).toMatchObject({
      namespace: 'platform',
      key_count: 1,
      drift: 'diverged',
      matchedKeys: [],
    })
  })

  it('sorts by namespace and then by name', () => {
    // `e` reaches all three: two by name and one only by a key name.
    expect(searchSecrets(INDEX, 'e').map((hit) => `${hit.namespace}/${hit.name}`)).toEqual([
      'payments/api',
      'payments/queue',
      'platform/database-urls',
    ])
  })

  it('ignores case, and surrounding space', () => {
    expect(searchSecrets(INDEX, '  QUEUE ').map((hit) => hit.name)).toEqual(['queue'])
  })

  it('answers an empty query with nothing rather than with everything', () => {
    expect(searchSecrets(INDEX, '   ')).toEqual([])
  })

  it('matches nothing it does not hold', () => {
    expect(searchSecrets(INDEX, 'nomatch')).toEqual([])
  })
})

describe('highlighting the matched run', () => {
  it('splits a name into the runs that matched and the runs that did not', () => {
    expect(highlightSegments('database-urls', 'url')).toEqual([
      { text: 'database-', hit: false },
      { text: 'url', hit: true },
      { text: 's', hit: false },
    ])
  })

  it('marks every occurrence without looping on a zero-length match', () => {
    expect(highlightSegments('a-a', 'a')).toEqual([
      { text: 'a', hit: true },
      { text: '-', hit: false },
      { text: 'a', hit: true },
    ])
  })

  it('returns the whole string unmarked for an empty query', () => {
    expect(highlightSegments('queue', '  ')).toEqual([{ text: 'queue', hit: false }])
  })
})

describe('the results panel', () => {
  it('groups hits by namespace and links each to its Secret', () => {
    // `url` reaches one Secret by name and two by a key name, so the grouping is doing real work:
    // the two payments rows belong under one namespace heading, not two.
    const wrapper = mountResults('url')

    expect(wrapper.findAll('h2').map((heading) => heading.text())).toEqual(['payments', 'platform'])
    expect(wrapper.findAll('a').map((link) => link.attributes('href'))).toEqual([
      '/secrets/payments/api',
      '/secrets/payments/queue',
      '/secrets/platform/database-urls',
    ])
    expect(wrapper.text()).toContain('3 matches in 2 namespaces')
  })

  it('names the matched key, which is why the row is in the list', () => {
    // The one place a key name is allowed to appear on a list: a search is a question the
    // operator asked, not an inventory they were handed.
    const wrapper = mountResults('stripe')

    expect(wrapper.text()).toContain('STRIPE_SECRET')
  })

  it('says a state out loud rather than in colour alone', () => {
    const wrapper = mountResults('database-urls')

    expect(wrapper.text()).toContain('Diverged')
  })

  it('says nothing matched, and names what was asked for', () => {
    const wrapper = mountResults('nomatch')

    expect(wrapper.text()).toContain('No Secret or key matches “nomatch”.')
  })

  it('says the index is being built rather than that nothing matched', () => {
    // An empty listing and a listing that has not arrived are different answers, and only one of
    // them is worth reading as "no results".
    const wrapper = mountResults('queue', [], false)

    expect(wrapper.text()).toContain('Searching…')
    expect(wrapper.text()).not.toContain('No Secret or key matches')
  })

  it('states a listing that failed, with a way to ask again', async () => {
    const store = useSecretsStore(pinia)
    store.indexError = new Error('gateway')
    const get = vi.spyOn(store, 'fetchIndex').mockResolvedValue([])
    const wrapper = mountResults('queue', [], false)

    expect(wrapper.text()).toContain('The search index could not be loaded.')
    expect(wrapper.text()).toContain('gateway')

    await wrapper.find('button').trigger('click')
    expect(get).toHaveBeenCalled()
  })
})
