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

    expect(wrapper.find('.brand').text()).toBe('kubeseal-ui')
    expect(wrapper.find('.user-label').text()).toBe('Ada')
    expect(wrapper.findAll('button').map((button) => button.text())).toContain('Sign out')
  })

  it('gives the theme control an accessible name and three states', () => {
    const wrapper = mountShell()

    const group = wrapper.find('[role="group"]')
    expect(group.exists()).toBe(true)
    expect(group.attributes('aria-label')).toBe('Colour theme')

    const options = wrapper.findAll('.theme-option')
    expect(options.map((option) => option.text())).toEqual(['Light', 'Dark', 'System'])
    for (const option of options) expect(option.attributes('aria-pressed')).toBeDefined()
  })

  it('shows the stored preference as pressed and records a new one', async () => {
    const ui = useUiStore(pinia)
    ui.setThemePreference('dark')
    const wrapper = mountShell()

    const pressed = () => wrapper.findAll('.theme-option').filter((option) => option.attributes('aria-pressed') === 'true')
    expect(pressed().map((option) => option.text())).toEqual(['Dark'])

    await wrapper.findAll('.theme-option').find((option) => option.text() === 'Light')!.trigger('click')

    expect(ui.themePreference).toBe('light')
    expect(pressed().map((option) => option.text())).toEqual(['Light'])
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
