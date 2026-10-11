import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { useUiStore } from '@/stores/ui'

let pinia: Pinia

function mountShell() {
  return mount(AppShell, {
    slots: { default: '<p id="route-content">route content</p>' },
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
}

beforeEach(() => {
  window.localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore(pinia).setSession({ email: 'ada@example.com', name: 'Ada', username: 'ada', namespaces: {} })
})

afterEach(() => {
  window.localStorage.clear()
})

describe('app shell', () => {
  it('renders the brand, the signed-in user, and sign out', () => {
    const wrapper = mountShell()

    expect(wrapper.findAll('a').map((link) => link.text())).toContain('kubeseal')
    expect(wrapper.text()).toContain('Ada')
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Sign out')
  })

  it('gives the theme control an accessible name and three states', () => {
    const wrapper = mountShell()

    const group = wrapper.find('[role="group"]')
    expect(group.exists()).toBe(true)
    expect(group.attributes('aria-label')).toBe('Colour theme')

    // Glyph-only options whose svg is aria-hidden: aria-label is their only name.
    const options = wrapper.findAll('[aria-pressed]')
    expect(options.map((option) => option.attributes('aria-label'))).toEqual(['Light', 'Dark', 'System'])
    for (const option of options) expect(option.attributes('aria-pressed')).toBeDefined()
  })

  it('shows the stored preference as pressed and records a new one', async () => {
    const ui = useUiStore(pinia)
    ui.setThemePreference('dark')
    const wrapper = mountShell()

    const pressed = () => wrapper.findAll('[aria-pressed]').filter((option) => option.attributes('aria-pressed') === 'true')
    expect(pressed().map((option) => option.attributes('aria-label'))).toEqual(['Dark'])

    await wrapper.findAll('[aria-pressed]').find((option) => option.attributes('aria-label') === 'Light')!.trigger('click')

    expect(ui.themePreference).toBe('light')
    expect(pressed().map((option) => option.attributes('aria-label'))).toEqual(['Light'])
  })

  it('offers a skip link to the main region it renders', () => {
    const wrapper = mountShell()

    const skip = wrapper.find('a.skip-link')
    expect(skip.attributes('href')).toBe('#main-content')

    const main = wrapper.find('main#main-content')
    expect(main.exists()).toBe(true)
    expect(main.text()).toContain('route content')
  })

  it('puts the search in the strip rather than behind a drawer', () => {
    const wrapper = mountShell()

    expect(wrapper.find('#secret-search').exists()).toBe(true)
    // The rail's controls are gone with the rail: no drawer to open, no second navigation.
    expect(wrapper.findAll('[aria-expanded]')).toHaveLength(0)
  })

  it('replaces the page with the results without unmounting it', async () => {
    // The route holds whatever the operator has staged, so a search must hide it rather than tear
    // it down — otherwise typing in the strip would discard a half-finished change.
    const secrets = useSecretsStore(pinia)
    secrets.index = [
      {
        name: 'api',
        namespace: 'payments',
        keys: ['DATABASE_URL'],
        key_count: 1,
        scope: 'strict',
        created_at: '2026-09-01T00:00:00Z',
        git: { managed: true, in_sync_with_live: true, drift: 'in-sync' },
      },
    ]
    secrets.indexLoaded = true

    const wrapper = mountShell()
    await wrapper.find('#secret-search').setValue('api')

    expect(wrapper.text()).toContain('1 match in 1 namespace')
    expect(wrapper.find('#route-content').exists()).toBe(true)
    expect(wrapper.find('main#main-content').text()).toContain('route content')

    // Clearing it hands the page back.
    await wrapper.find('button[aria-label="Clear the search"]').trigger('click')
    expect(wrapper.text()).not.toContain('match in 1 namespace')
  })
})
