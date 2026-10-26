import { defineStore } from 'pinia'

// Only a non-sensitive layout preference is persisted. The search query is deliberately not here either: it lives in AppShell, above the route, and nothing else can read it.
export type ThemePreference = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'kubeseal-ui.theme'
const VALID: readonly ThemePreference[] = ['light', 'dark', 'system']

function readPreference(): ThemePreference {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    return VALID.includes(raw as ThemePreference) ? (raw as ThemePreference) : 'system'
  } catch {
    // Private-mode browsers throw on localStorage; following the OS beats not starting.
    return 'system'
  }
}

function persistPreference(value: ThemePreference): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, value)
  } catch {
    // Persistence is a convenience; the preference still applies this session.
  }
}

export const useUiStore = defineStore('ui', {
  state: () => ({
    themePreference: readPreference(),
  }),
  actions: {
    setThemePreference(value: ThemePreference) {
      this.themePreference = value
      persistPreference(value)
    },
  },
})

export const THEME_PREFERENCE_STORAGE_KEY = STORAGE_KEY
