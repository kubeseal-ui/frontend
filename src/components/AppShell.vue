<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import { type IconName } from '@/components/ui/icons'
import SearchResults from '@/components/SearchResults.vue'
import SecretSearch from '@/components/SecretSearch.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore, type ThemePreference } from '@/stores/ui'
import { avatarUrl } from '@/utils/avatar'

const auth = useAuthStore()
const ui = useUiStore()

// The query lives here, above the route, because the strip replaces the page rather than floating
// over it. Nothing else reads it, which is what lets the route below stay mounted — `v-show`, not
// `v-if` — so a Secret with a half-staged change is still there when the search is cleared.
const query = ref('')
const searching = computed(() => query.value.trim() !== '')

// A result in the strip is a link, and the strip replaces the page rather than floating over it, so
// following a hit has to clear the query — otherwise the results stay mounted over the Secret the
// link just loaded (the route changes and the fetch runs, but `v-if="searching"` keeps covering it).
// The query lives here, not in the URL, so no navigation clears it on its own; any route change does.
const route = useRoute()
watch(() => route.fullPath, () => { query.value = '' })

const displayName = computed(() => auth.user?.name || auth.user?.username || '')
// Two letters at most: an avatar is a mark, and three initials at 10px is a smudge.
const initials = computed(() =>
  displayName.value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase(),
)
const email = computed(() => auth.user?.email ?? '')

// The account photo, empty unless the deployment names an endpoint — see utils/avatar.ts. A failed
// load resets with the address it belongs to, so one account's miss cannot blank the next one's.
const photo = computed(() => avatarUrl(email.value))
const photoFailed = ref(false)
watch(photo, () => {
  photoFailed.value = false
})

// The account control is a native disclosure: the toggle, the keyboard operation and the
// announcement are the element's own. What it does not have is a way out — Escape closes it and
// hands focus back to the summary it came from, and a click anywhere else closes it, which is also
// what every navigation in this app is.
const account = ref<HTMLDetailsElement | null>(null)
const summary = ref<HTMLElement | null>(null)

function onPointerDown(event: PointerEvent) {
  if (account.value && !account.value.contains(event.target as Node)) account.value.open = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape' || !account.value?.open) return
  account.value.open = false
  summary.value?.focus()
}

onMounted(() => {
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKeydown)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onPointerDown)
  document.removeEventListener('keydown', onKeydown)
})

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

        <!-- The account is one control: the photo, the name, and the way out are the same subject,
             and a Sign out button standing beside them read as unrelated to the account it ends.
             The name drops visually below md but stays in the accessibility tree, because an
             avatar-only control would otherwise have no name at all. -->
        <details v-if="auth.user" ref="account" class="relative shrink-0">
          <summary
            ref="summary"
            class="flex cursor-pointer list-none items-center gap-2 rounded-control px-1.5 py-1 text-[13px] text-muted hover:bg-surface-raised hover:text-ink [&::-webkit-details-marker]:hidden"
          >
            <!-- The initials are the standing mark and the photo only ever covers them, so a
                 missing image, an address the service has no record of, and avatars switched off
                 are all the same rendering. -->
            <span class="relative flex size-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-border-strong bg-surface-raised text-[10px] font-bold text-ink">
              <span aria-hidden="true">{{ initials }}</span>
              <img
                v-if="photo && !photoFailed"
                :src="photo"
                alt=""
                referrerpolicy="no-referrer"
                class="absolute inset-0 size-full object-cover"
                @error="photoFailed = true"
              />
            </span>
            <span class="sr-only md:not-sr-only">{{ displayName || 'Account' }}</span>
            <AppIcon name="chevron-down" :size="12" class="text-faint" />
          </summary>

          <!-- A surface with a full border and no shadow: the app has no elevation layer to
               borrow, and a panel that floats above the header would be the only one. -->
          <div class="absolute right-0 top-[calc(100%+6px)] z-10 min-w-[200px] rounded-control border border-border-strong bg-surface p-1.5">
            <p v-if="email" class="m-0 truncate border-b border-border px-2 pb-[7px] font-mono text-[11.5px] text-muted">
              {{ email }}
            </p>
            <button
              type="button"
              class="mt-[5px] flex w-full cursor-pointer items-center gap-2 rounded-mini border-0 bg-transparent px-2 py-1.5 text-left text-[13px] text-ink hover:bg-surface-raised"
              @click="logout"
            >
              <AppIcon name="sign-out" :size="14" class="text-muted" />
              Sign out
            </button>
          </div>
        </details>
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
