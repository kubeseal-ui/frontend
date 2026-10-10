import { defineStore } from 'pinia'

// The only thing this store persists is a non-sensitive layout preference, which the
// frontend state contract allows in localStorage. Secret values, drafts, and session
// state are never stored here.
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
    // The narrow-screen rail drawer: chrome, not a preference, so not persisted.
    railOpen: false,
    // A counter rather than a flag: asking twice has to reach the box twice.
    searchRequests: 0,
  }),
  actions: {
    setThemePreference(value: ThemePreference) {
      this.themePreference = value
      persistPreference(value)
    },
    openRail(focusSearch = false) {
      this.railOpen = true
      if (focusSearch) this.searchRequests += 1
    },
    closeRail() {
      this.railOpen = false
    },
  },
})

export const THEME_PREFERENCE_STORAGE_KEY = STORAGE_KEY
