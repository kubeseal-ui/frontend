import { computed, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import { useUiStore } from '@/stores/ui'
import { buildThemeOverrides, type ThemeMode } from '@/theme/naive'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function darkMediaQuery(): MediaQueryList | null {
  // Read through globalThis rather than window so the lookup is the same one a
  // test can replace; window and globalThis are the same object in a browser.
  const media = globalThis.matchMedia
  if (typeof media !== 'function') return null
  return media.call(globalThis, DARK_QUERY)
}

/**
 * Resolves the stored theme preference into the theme actually in use.
 *
 * While the preference is `system` the OS setting is followed live; an explicit
 * choice outranks it. The resolved theme is published as `data-theme` on the
 * document element so the stylesheet's non-media palette blocks can override
 * the host's own preference.
 *
 * Every browser API here is optional: unit tests and any non-browser caller get
 * a light theme and a no-op instead of a crash.
 */
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
    themeOverrides: computed(() => buildThemeOverrides(resolvedTheme.value)),
  }
}
