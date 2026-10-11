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

    <!-- A band, not a panel: every screen shares it, and a rounded surface here would read as a
         second page. -->
    <header class="sticky top-0 z-20 flex items-center gap-[18px] border-b border-border bg-surface px-[22px] py-3">
      <RouterLink to="/" class="flex shrink-0 items-center gap-2.5 no-underline">
        <span class="flex size-[30px] items-center justify-center rounded-control bg-accent text-accent-ink">
          <AppIcon name="lock" :size="16" />
        </span>
        <span class="hidden text-[15px] font-bold tracking-[-0.03em] text-ink sm:inline">kubeseal</span>
      </RouterLink>

      <!-- The strip is what the query is typed into even when it is answering, so it is never an
           overlay. -->
      <SecretSearch v-model="query" />

      <span class="flex-1" aria-hidden="true" />

      <div class="flex shrink-0 items-center gap-2.5">
        <!-- Pressed buttons, not a radio group: each one is its glyph alone, so aria-label is its
             name. -->
        <div class="flex items-center gap-[2px] rounded-control border border-border bg-bg p-[3px]" role="group" aria-label="Colour theme">
          <button
            v-for="theme in themes"
            :key="theme.value"
            type="button"
            :aria-label="theme.label"
            :title="theme.label"
            class="inline-flex h-6 w-[26px] cursor-pointer items-center justify-center rounded-chip border-0"
            :class="
              ui.themePreference === theme.value
                ? 'bg-surface-raised text-accent'
                : 'bg-transparent text-faint hover:text-ink'
            "
            :aria-pressed="ui.themePreference === theme.value"
            @click="ui.setThemePreference(theme.value)"
          >
            <AppIcon :name="theme.icon" :size="14" />
          </button>
        </div>

        <!-- The avatar is decorative — the name beside it is the fact — and the cluster goes at
             the width where the name would start truncating. -->
        <span v-if="displayName" class="hidden items-center gap-2 text-[13px] text-muted md:flex">
          <span aria-hidden="true" class="flex size-[26px] items-center justify-center rounded-full border border-border-strong bg-surface-raised text-[10px] font-bold text-ink">{{ initials }}</span>
          {{ displayName }}
        </span>

        <AppButton v-if="auth.isAuthenticated" variant="secondary" size="small" icon="sign-out" @click="logout">Sign out</AppButton>
      </div>
    </header>

    <!-- No horizontal padding here: sections own their own `px-[26px]`, so a full-bleed row can
         reach the edge its keyline is drawn at. -->
    <div class="mx-auto w-[min(1320px,100%)] pb-16">
      <main id="main-content" class="min-w-0">
        <SearchResults v-if="searching" :query="query" />
        <div v-show="!searching"><slot /></div>
      </main>
    </div>
  </div>
</template>
