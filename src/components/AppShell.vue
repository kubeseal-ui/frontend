<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/ui/AppIcon.vue'
import { type IconName } from '@/components/ui/icons'
import SearchResults from '@/components/SearchResults.vue'
import SecretSearch from '@/components/SecretSearch.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore, type ThemePreference } from '@/stores/ui'
import { avatarUrl } from '@/utils/avatar'

const auth = useAuthStore()
const ui = useUiStore()

// The query lives here so the strip can replace the page with `v-show`, keeping a Secret with a half-staged change mounted underneath.
const query = ref('')
// Searching reads the whole cluster, so it is neither offered nor rendered once the session is gone.
const searching = computed(() => Boolean(auth.user) && query.value.trim() !== '')

// A followed hit must clear the query, or the results stay mounted over the Secret the link just loaded; no route change clears it on its own.
const route = useRoute()
const router = useRouter()
watch(() => route.fullPath, () => { query.value = '' })

const displayName = computed(() => auth.user?.name || auth.user?.username || '')
// Two letters at most: an avatar is a mark, and three initials at 10px is a smudge.
const initials = computed(() =>
  displayName.value.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || '').join('').toUpperCase(),
)
const email = computed(() => auth.user?.email ?? '')

// The account photo, empty unless the deployment names an endpoint — see utils/avatar.ts; a failed load resets with the address it belongs to.
const photo = computed(() => avatarUrl(email.value))
const photoFailed = ref(false)
watch(photo, () => {
  photoFailed.value = false
})

// The account control is a native disclosure; Escape closes it and returns focus to its summary, and a click elsewhere closes it, as every navigation does.
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
  // Replace, not push: back from the signed-out page must not land on the sessionless view just left; the store's signedOut flag holds off the 401 redirect.
  await router.replace('/signed-out')
}
</script>

<template>
  <div class="min-h-dvh">
    <a
      class="skip-link absolute -left-[9999px] top-0 z-30 rounded-br-lg border border-border-strong bg-surface px-4 py-2.5 font-semibold text-ink no-underline focus:left-0"
      href="#main-content"
    >Skip to main content</a>

    <!-- Pinned arithmetic: desktop header 59px, phone 105px; the sticky offsets in SecretSurface and NewSecretView are derived from these — change together. -->
    <header class="sticky top-0 z-20 flex flex-wrap items-center gap-2.5 border-b border-border bg-surface px-4 py-3 sm:gap-[18px] sm:px-[22px]">
      <RouterLink to="/" class="flex shrink-0 items-center gap-2.5 no-underline">
        <span class="flex size-[30px] items-center justify-center rounded-control bg-accent text-accent-ink">
          <AppIcon name="lock" :size="16" />
        </span>
        <span class="hidden text-[15px] font-bold tracking-[-0.03em] text-ink sm:inline">kubeseal</span>
      </RouterLink>

      <!-- The strip is typed into even while answering, so it is never an overlay; on a phone it drops to its own row, the second of the pinned 105px. -->
      <SecretSearch v-if="auth.user" v-model="query" class="max-sm:order-last max-sm:basis-full" />

      <span class="flex-1" aria-hidden="true" />

      <div class="flex shrink-0 items-center gap-2.5">
        <!-- Pressed buttons, not a radio group: each is its glyph alone, so aria-label is its name. -->
        <div class="flex items-center gap-[2px] rounded-control border border-border bg-bg p-[3px]" role="group" aria-label="Colour theme">
          <button
            v-for="theme in themes"
            :key="theme.value"
            type="button"
            :aria-label="theme.label"
            :title="theme.label"
            class="inline-flex h-6 w-[26px] max-sm:h-9 max-sm:w-9 cursor-pointer items-center justify-center rounded-chip border-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            :class="
              ui.themePreference === theme.value
                ? 'bg-accent text-accent-ink'
                : 'bg-transparent text-muted hover:bg-surface-raised hover:text-ink'
            "
            :aria-pressed="ui.themePreference === theme.value"
            @click="ui.setThemePreference(theme.value)"
          >
            <AppIcon :name="theme.icon" :size="14" />
          </button>
        </div>

        <!-- The account is one control — photo, name, and way out — and the name stays in the accessibility tree below md so an avatar-only control still has a name. -->
        <details v-if="auth.user" ref="account" class="relative shrink-0">
          <summary
            ref="summary"
            class="flex max-sm:py-2 cursor-pointer list-none items-center gap-2 rounded-control px-1.5 py-1 text-[13px] text-muted hover:bg-surface-raised hover:text-ink [&::-webkit-details-marker]:hidden"
          >
            <!-- The initials are the standing mark and the photo only covers them, so a missing image, an unknown address, and avatars off render the same. -->
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
            <AppIcon name="chevron-down" :size="12" class="chev text-faint" />
          </summary>

          <!-- A surface with a full border and no shadow: the app has no elevation layer, and a floating panel would be the only one. -->
          <div class="pop-in absolute right-0 top-[calc(100%+6px)] z-10 min-w-[200px] rounded-control border border-border-strong bg-surface p-1.5">
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

    <!-- No horizontal padding: sections own their gutter through `page-x`, so a full-bleed row can reach its keyline and a phone narrows the gutter in one place. -->
    <div
      class="mx-auto pb-16"
      :class="route.name === 'home' || route.name === 'namespaces' ? 'w-[min(1600px,100%)]' : 'w-[min(1320px,100%)]'"
    >
      <main id="main-content" class="min-w-0">
        <SearchResults v-if="searching" :query="query" />
        <div v-show="!searching"><slot /></div>
      </main>
    </div>
  </div>
</template>
