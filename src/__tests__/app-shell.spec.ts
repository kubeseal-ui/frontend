// The shared chrome every route renders inside. A view cannot render without
// it and cannot render a competing header, so this spec is the guard on the
// header's contents and the skip-link contract.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'

let pinia: Pinia

function mountShell() {
  return mount(AppShell, {
    slots: { default: '<p>route content</p>' },
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

    // Located by content and role rather than by a styling class: the shell is
    // utility-first now, so the classes that used to double as test hooks are
    // gone and the text is the stable part.
    expect(wrapper.findAll('a').map((link) => link.text())).toContain('kubeseal-ui')
    expect(wrapper.text()).toContain('Ada')
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Sign out')
  })

  it('gives the theme control an accessible name and three states', () => {
    const wrapper = mountShell()

    const group = wrapper.find('[role="group"]')
    expect(group.exists()).toBe(true)
    expect(group.attributes('aria-label')).toBe('Colour theme')

    // Located by aria-label, not by text: the options are glyph-only, and the
    // svg inside them is aria-hidden, so the label attribute is the only name
    // these controls have. Asserting it here is what keeps that true.
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
})
