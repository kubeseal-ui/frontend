import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'

// What the three-state *preference* (`light | dark | system`) resolves to.
type ThemeMode = 'light' | 'dark'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function darkMediaQuery(): MediaQueryList | null {
  // globalThis, not window, so a test can replace the lookup.
  const media = globalThis.matchMedia
  if (typeof media !== 'function') return null
  return media.call(globalThis, DARK_QUERY)
}

// Follows the OS live while the preference is `system`; an explicit choice outranks it.
// Publishing the result as `data-theme` is what lets the stylesheet's non-media palette
// blocks override the host's preference.
export function useColorScheme() {
  const ui = useUiStore()
  const query = darkMediaQuery()
  const systemPrefersDark = ref(query?.matches ?? false)

  const onSystemChange = (event: MediaQueryListEvent) => {
    systemPrefersDark.value = event.matches
  }

  if (query && typeof query.addEventListener === 'function') {
    query.addEventListener('change', onSystemChange)
    if (getCurrentScope()) onScopeDispose(() => query.removeEventListener('change', onSystemChange))
  }

  const resolvedTheme = computed<ThemeMode>(() => {
    if (ui.themePreference === 'system') return systemPrefersDark.value ? 'dark' : 'light'
    return ui.themePreference
  })

  watch(
    resolvedTheme,
    (theme) => {
      if (typeof document === 'undefined') return
      document.documentElement.dataset.theme = theme
    },
    { immediate: true },
  )

  return {
    resolvedTheme,
    isDark: computed(() => resolvedTheme.value === 'dark'),
  }
}
