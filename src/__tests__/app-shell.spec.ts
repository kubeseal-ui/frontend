import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import AppShell from '@/components/AppShell.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { useUiStore } from '@/stores/ui'
import { avatarUrl } from '@/utils/avatar'

const ACCOUNT_ENDPOINT = 'https://www.gravatar.com/avatar'
const SIGNED_IN_EMAIL = 'ada@example.com'

let pinia: Pinia
let shell: VueWrapper | undefined

function mountShell() {
  // Attached, unlike the rest of the suite: `focus()` is a no-op on a detached tree, so the Escape
  // path's hand-back is not assertable without it. `afterEach` unmounts, which is also what
  // unregisters the control's document listeners.
  shell = mount(AppShell, {
    attachTo: document.body,
    slots: { default: '<p id="route-content">route content</p>' },
    global: {
      plugins: [pinia],
      stubs: { RouterLink: { template: '<a><slot /></a>' } },
    },
  })
  return shell
}

/** The account control is a native disclosure, so its state is the element's own property. */
function account(wrapper: ReturnType<typeof mountShell>): HTMLDetailsElement {
  return wrapper.find('details').element as HTMLDetailsElement
}

beforeEach(() => {
  window.localStorage.clear()
  pinia = createPinia()
  setActivePinia(pinia)
  useAuthStore(pinia).setSession({ email: SIGNED_IN_EMAIL, name: 'Ada', username: 'ada', namespaces: {} })
})

afterEach(() => {
  shell?.unmount()
  shell = undefined
  window.localStorage.clear()
  vi.unstubAllEnvs()
})

describe('app shell', () => {
  it('renders the brand and the account control', () => {
    const wrapper = mountShell()

    expect(wrapper.findAll('a').map((link) => link.text())).toContain('kubeseal')
    // The name is the summary's accessible name at every width; only its visual is width-dependent.
    expect(wrapper.find('summary').text()).toContain('Ada')
  })

  it('keeps sign out inside the account disclosure rather than beside it', async () => {
    const auth = useAuthStore(pinia)
    const logout = vi.spyOn(auth, 'logout').mockResolvedValue(undefined)
    const wrapper = mountShell()
    const signOut = () => wrapper.findAll('button').find((button) => button.text() === 'Sign out')!

    // Closed until asked for, and the press belongs to the account rather than standing beside it
    // in the header row.
    expect(account(wrapper).open).toBe(false)
    expect(signOut().element.closest('details')).toBe(account(wrapper))

    await wrapper.find('summary').trigger('click')
    expect(account(wrapper).open).toBe(true)

    await signOut().trigger('click')
    expect(logout).toHaveBeenCalled()
  })

  it('closes on Escape and hands focus back to the name', () => {
    const wrapper = mountShell()
    account(wrapper).open = true

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

    expect(account(wrapper).open).toBe(false)
    expect(document.activeElement).toBe(wrapper.find('summary').element)
  })

  it('closes on a click anywhere else, which is also what every navigation is', () => {
    const wrapper = mountShell()
    account(wrapper).open = true

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    expect(account(wrapper).open).toBe(false)
  })

  it('stays open when the click is inside it', () => {
    const wrapper = mountShell()
    account(wrapper).open = true

    wrapper.find('summary').element.dispatchEvent(new Event('pointerdown', { bubbles: true }))

    expect(account(wrapper).open).toBe(true)
  })

  it('leaves the initials mark alone until a deployment configures an avatar endpoint', () => {
    const wrapper = mountShell()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('summary').text()).toContain('A')
  })

  it('asks the configured endpoint for the signed-in address', () => {
    vi.stubEnv('VITE_AVATAR_ENDPOINT', ACCOUNT_ENDPOINT)
    const wrapper = mountShell()

    const src = wrapper.find('img').attributes('src')
    expect(src).toContain(ACCOUNT_ENDPOINT)
    expect(src).toBe(avatarUrl(SIGNED_IN_EMAIL))
  })

  it('falls back to the initials when the photo does not load', async () => {
    vi.stubEnv('VITE_AVATAR_ENDPOINT', ACCOUNT_ENDPOINT)
    const wrapper = mountShell()
    expect(wrapper.find('img').exists()).toBe(true)

    // No record of the address, no route to the service, and avatars switched off all land in the
    // same place — the mark the control always had — and none of them is worth a message.
    await wrapper.find('img').trigger('error')

    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.find('summary').text()).toContain('A')
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
    // The rail's controls are gone with the rail: no drawer to open, no second navigation. The
    // account control is a native disclosure, so it is the one expansion here and it still
    // contributes no aria-expanded of its own.
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
