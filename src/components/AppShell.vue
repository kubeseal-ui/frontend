<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { type IconName } from '@/components/ui/icons'
import { useAuthStore } from '@/stores/auth'
import { useUiStore, type ThemePreference } from '@/stores/ui'
import { LENS_MAP } from '@/theme/lens-map'

const auth = useAuthStore()
const ui = useUiStore()

const displayName = computed(() => auth.user?.name || auth.user?.username || '')

const themes: { value: ThemePreference; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
]

// Contracts the header once the page scrolls past the sentinel above it. Optional
// everywhere: without IntersectionObserver it keeps its resting height.
const contracted = ref(false)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  if (typeof IntersectionObserver !== 'function' || !sentinel.value) return
  observer = new IntersectionObserver((entries) => {
    contracted.value = !entries[0]?.isIntersecting
  })
  observer.observe(sentinel.value)
})

onUnmounted(() => observer?.disconnect())

// The drawer is off-canvas below lg and a static column at lg, so Escape only matters narrow.
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') ui.closeRail()
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onUnmounted(() => window.removeEventListener('keydown', onKeydown))

async function logout() {
  await auth.logout()
}
</script>

<template>
  <div class="min-h-screen">
    <div ref="sentinel" aria-hidden="true" class="h-px"></div>

    <!--
      The lens filter. Its two halves live in different files — src/theme/lens-map.ts
      holds the displacement map, style.css references this filter by id inside a
      @supports query — and glass-fallbacks.spec.ts pins them to each other, because a
      rename on either side would silently disable the lens.
    -->
    <svg aria-hidden="true" focusable="false" class="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        <filter id="liquid-lens" x="-20%" y="-20%" width="140%" height="140%">
          <feImage :href="LENS_MAP" :xlink:href="LENS_MAP" result="lensMap" preserveAspectRatio="none" />
          <!-- Softening the map turns flat bands into a ramp; a hard-edged map
               displaces the backdrop in visible steps. -->
          <feGaussianBlur in="lensMap" stdDeviation="6" result="lensRamp" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="lensRamp"
            scale="14"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>

    <a
      class="skip-link absolute -left-[9999px] top-0 z-30 rounded-br-xl border border-border-strong bg-surface px-4 py-2.5 font-semibold text-ink no-underline focus:left-0"
      href="#main-content"
    >Skip to main content</a>

    <!-- The only persistent glass surface: stacking glass on glass leaves the second
         layer nothing legible to refract. -->
    <header
      class="glass sticky top-0 z-10 flex items-center justify-between gap-4 rounded-none px-[clamp(1rem,4vw,4rem)] py-[0.7rem] data-[contracted=true]:py-[0.45rem]"
      :data-contracted="String(contracted)"
    >
      <RouterLink to="/" class="flex items-center gap-2 text-[1.1rem] font-bold tracking-tight text-ink no-underline">
        <span class="flex size-7 items-center justify-center rounded-lg border border-border-strong/60 bg-surface/60 text-accent">
          <AppIcon name="lock" :size="16" />
        </span>
        kubeseal-ui
      </RouterLink>

      <div class="header-cluster flex items-center gap-2 rounded-chip border border-border-strong/50 bg-surface/70 py-1 pl-3 pr-1.5">
        <span v-if="displayName" class="hidden items-center gap-1.5 text-sm text-muted sm:flex">
          <AppIcon name="shield" :size="14" />
          {{ displayName }}
        </span>

        <!-- The rail is a static column from lg up, so these two exist only for the drawer. They
             carry aria-expanded rather than aria-pressed: they disclose a region, and the theme
             control's pressed-state is not something they should be counted among. -->
        <div class="flex items-center gap-1 lg:hidden">
          <button
            type="button"
            aria-label="Search Secrets"
            :aria-expanded="ui.railOpen"
            aria-controls="secret-rail"
            class="inline-flex cursor-pointer items-center justify-center rounded-chip border-0 p-1.5 text-muted hover:text-ink"
            @click="ui.openRail(true)"
          >
            <AppIcon name="search" :size="14" />
          </button>
          <button
            type="button"
            :aria-label="ui.railOpen ? 'Close the Secret list' : 'Browse Secrets'"
            :aria-expanded="ui.railOpen"
            aria-controls="secret-rail"
            class="inline-flex cursor-pointer items-center justify-center rounded-chip border-0 p-1.5 text-muted hover:text-ink"
            @click="ui.railOpen ? ui.closeRail() : ui.openRail()"
          >
            <AppIcon :name="ui.railOpen ? 'x' : 'menu'" :size="14" />
          </button>
        </div>

        <!-- A segmented control of pressed buttons, not a radio group: each button is
             its glyph alone, so aria-label is its name. The selected chip takes the accent,
             a surface fill and a rim, because the track's fill against the cluster's own is
             under a percent apart — a selection resting on that fill alone would not be one.
             Each state is one class list, because two utilities on the same property are
             resolved by stylesheet order, not attribute order. -->
        <div class="flex items-center gap-[2px] rounded-chip bg-bg/70 p-[3px]" role="group" aria-label="Colour theme">
          <button
            v-for="theme in themes"
            :key="theme.value"
            type="button"
            :aria-label="theme.label"
            :title="theme.label"
            class="inline-flex cursor-pointer items-center justify-center rounded-chip border-0 p-1.5"
            :class="
              ui.themePreference === theme.value
                ? 'bg-surface text-accent ring-1 ring-border-strong'
                : 'bg-transparent text-muted hover:text-ink'
            "
            :aria-pressed="ui.themePreference === theme.value"
            @click="ui.setThemePreference(theme.value)"
          >
            <AppIcon :name="theme.icon" :size="14" />
          </button>
        </div>

        <AppButton v-if="auth.isAuthenticated" variant="secondary" icon="sign-out" @click="logout">Sign out</AppButton>
      </div>
    </header>

    <div class="mx-auto flex w-[min(1400px,calc(100%_-_2rem))] items-start gap-6 pt-10 pb-16">
      <!-- One element, not two: rendering the rail at both breakpoints would mount it twice and
           fetch its listings twice. It slides off-canvas by visibility, which also keeps it out of
           the tab order and the accessibility tree while it is closed. -->
      <div v-if="ui.railOpen" class="fixed inset-0 z-10 bg-ink/30 lg:hidden" @click="ui.closeRail()"></div>
      <aside
        id="secret-rail"
        class="fixed inset-y-0 left-0 z-20 flex w-[80vw] max-w-[280px] flex-col overflow-y-auto border-r border-border bg-bg p-3 lg:sticky lg:top-24 lg:z-auto lg:max-h-[calc(100vh-8rem)] lg:w-[190px] lg:shrink-0 lg:border-0 lg:bg-transparent lg:p-0"
        :class="ui.railOpen ? 'visible' : 'invisible lg:visible'"
      >
        <slot name="rail" />
      </aside>

      <main id="main-content" class="min-w-0 flex-1">
        <slot />
      </main>
    </div>
  </div>
</template>
