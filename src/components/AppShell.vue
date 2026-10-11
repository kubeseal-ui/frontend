<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { type IconName } from '@/components/ui/icons'
import SearchResults from '@/components/SearchResults.vue'
import SecretSearch from '@/components/SecretSearch.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore, type ThemePreference } from '@/stores/ui'

const auth = useAuthStore()
const ui = useUiStore()

// The query lives here, above the route, because the strip replaces the page rather than floating
// over it. Nothing else reads it, which is what lets the route below stay mounted — `v-show`, not
// `v-if` — so a Secret with a half-staged change is still there when the search is cleared.
const query = ref('')
const searching = computed(() => query.value.trim() !== '')

const displayName = computed(() => auth.user?.name || auth.user?.username || '')
// Two letters at most: an avatar is a mark, and three initials at 10px is a smudge.
const initials = computed(() =>
  displayName.value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase(),
)

const themes: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
]

async function logout() {
  await auth.logout()
}
</script>

<template>
  <div class="min-h-screen">
    <a
      class="skip-link absolute -left-[9999px] top-0 z-30 rounded-br-lg border border-border-strong bg-surface px-4 py-2.5 font-semibold text-ink no-underline focus:left-0"
      href="#main-content"
    >Skip to main content</a>

    <!-- Flat, keylined, and opaque. The bar is a band rather than a panel: every screen shares it,
         and a rounded surface here would read as a second page. -->
    <header class="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-surface px-[clamp(1rem,4vw,4rem)] py-2">
      <RouterLink to="/" class="flex shrink-0 items-center gap-2 no-underline">
        <span class="flex size-7 items-center justify-center rounded-control bg-accent text-accent-ink">
          <AppIcon name="lock" :size="16" />
        </span>
        <span class="hidden text-[1.0625rem] font-semibold tracking-tight text-ink sm:inline">kubeseal-ui</span>
      </RouterLink>

      <!-- Centred in the space the two clusters leave, and capped: a search box that spans a wide
           window stops reading as a field and starts reading as a banner. -->
      <div class="mx-auto w-full min-w-0 max-w-[26rem]">
        <SecretSearch v-model="query" />
      </div>

      <div class="flex shrink-0 items-center gap-2">
        <!-- A segmented control of pressed buttons, not a radio group: each button is its glyph
             alone, so aria-label is its name. The selected chip takes the accent and a surface
             fill, because the track's fill against the bar's own is under a percent apart — a
             selection resting on that fill alone would not be one. -->
        <div class="flex items-center gap-[2px] rounded-chip border border-border p-[2px]" role="group" aria-label="Colour theme">
          <button
            v-for="theme in themes"
            :key="theme.value"
            type="button"
            :aria-label="theme.label"
            :title="theme.label"
            class="inline-flex cursor-pointer items-center justify-center rounded-chip border-0 p-1.5"
            :class="
              ui.themePreference === theme.value
                ? 'bg-surface-raised text-accent'
                : 'bg-transparent text-muted hover:text-ink'
            "
            :aria-pressed="ui.themePreference === theme.value"
            @click="ui.setThemePreference(theme.value)"
          >
            <AppIcon :name="theme.icon" :size="14" />
          </button>
        </div>

        <!-- Who is signed in. The avatar is decorative — the name beside it is the fact — and the
             whole cluster goes at the width where the name would start truncating instead. -->
        <span v-if="displayName" class="hidden items-center gap-2 md:flex">
          <span aria-hidden="true" class="flex size-6 items-center justify-center rounded-full bg-surface-raised font-mono text-[0.625rem] text-muted">{{ initials }}</span>
          <span class="text-sm text-muted">{{ displayName }}</span>
        </span>

        <AppButton v-if="auth.isAuthenticated" variant="secondary" size="small" icon="sign-out" @click="logout">Sign out</AppButton>
      </div>
    </header>

    <div class="mx-auto w-[min(1400px,calc(100%_-_2rem))] pt-8 pb-16">
      <main id="main-content" class="min-w-0">
        <SearchResults v-if="searching" :query="query" />
        <div v-show="!searching"><slot /></div>
      </main>
    </div>
  </div>
</template>
