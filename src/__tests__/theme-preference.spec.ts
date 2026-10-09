// The composable is called from App.vue's setup, so it must also survive being called
// with no component scope and no matchMedia.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { useUiStore, THEME_PREFERENCE_STORAGE_KEY as KEY } from '@/stores/ui'
import { useColorScheme } from '@/composables/useColorScheme'

let pinia: Pinia

function stubMatchMedia(initialMatches: boolean) {
  const listeners = new Set<(event: MediaQueryListEvent) => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: initialMatches,
    media: query,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
  }))
  return {
    emit(matches: boolean) {
      for (const listener of listeners) listener({ matches } as MediaQueryListEvent)
    },
  }
}

beforeEach(() => {
  window.localStorage.clear()
  delete document.documentElement.dataset.theme
  pinia = createPinia()
  setActivePinia(pinia)
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.theme
})

describe('theme preference store', () => {
  it('defaults to following the system', () => {
    expect(useUiStore(pinia).themePreference).toBe('system')
  })

  it('persists an explicit choice', () => {
    useUiStore(pinia).setThemePreference('dark')
    expect(window.localStorage.getItem(KEY)).toBe('dark')
  })

  it('restores a stored choice', () => {
    window.localStorage.setItem(KEY, 'dark')
    setActivePinia(createPinia())
    expect(useUiStore().themePreference).toBe('dark')
  })

  it('ignores a stored value it does not recognise', () => {
    window.localStorage.setItem(KEY, 'sepia')
    setActivePinia(createPinia())
    expect(useUiStore().themePreference).toBe('system')
  })
})

describe('resolved colour scheme', () => {
  it('follows the system while the preference is system', async () => {
    const media = stubMatchMedia(false)
    const { resolvedTheme } = useColorScheme()

    expect(resolvedTheme.value).toBe('light')
    media.emit(true)
    await nextTick()
    expect(resolvedTheme.value).toBe('dark')
  })

  it('lets an explicit choice outrank a dark system setting', async () => {
    stubMatchMedia(true)
    const ui = useUiStore(pinia)
    const { resolvedTheme } = useColorScheme()

    expect(resolvedTheme.value).toBe('dark')
    ui.setThemePreference('light')
    await nextTick()

    expect(resolvedTheme.value).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('publishes the resolved theme on the document element', async () => {
    stubMatchMedia(false)
    const ui = useUiStore(pinia)
    const { resolvedTheme } = useColorScheme()

    expect(document.documentElement.dataset.theme).toBe('light')
    ui.setThemePreference('dark')
    await nextTick()

    expect(resolvedTheme.value).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('degrades to light when matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined)
    const { resolvedTheme } = useColorScheme()
    expect(resolvedTheme.value).toBe('light')
  })
})
