<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import AppButton from '@/components/ui/AppButton.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore, type ThemePreference } from '@/stores/ui'
import { LENS_MAP } from '@/theme/lens-map'

const auth = useAuthStore()
const ui = useUiStore()

const displayName = computed(() => auth.user?.name || auth.user?.username || '')

const themes: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

// The header contracts once the page has scrolled past the sentinel above it.
// Optional everywhere: without IntersectionObserver the header simply keeps its
// resting height, which is the state it would be in at the top of the page.
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

async function logout() {
  await auth.logout()
}
</script>

<template>
  <div class="min-h-screen">
    <!-- Anchors the header's contracted state to the top of the document. -->
    <div ref="sentinel" aria-hidden="true" class="h-px"></div>

    <!--
      The lens filter. Both halves of the refraction live in different files:
      src/theme/lens-map.ts describes the bevelled displacement map and
      style.css references this filter by id inside a @supports query.
      glass-fallbacks.spec.ts pins the two halves to each other, because a
      rename on either side would silently disable the lens.

      Declared once at the root: the filter is document-scoped, and the surfaces
      that use it are scattered across every route.
    -->
    <svg aria-hidden="true" focusable="false" class="pointer-events-none absolute h-0 w-0 overflow-hidden">
      <defs>
        <filter id="liquid-lens" x="-20%" y="-20%" width="140%" height="140%">
          <feImage :href="LENS_MAP" :xlink:href="LENS_MAP" result="lensMap" preserveAspectRatio="none" />
          <!-- Softening the map is what turns the flat bands into a ramp; a
               hard-edged map displaces the backdrop in visible steps. -->
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

    <!--
      The only persistent glass surface. Everything below it sits on the page
      background, because stacking glass on glass is the one thing Apple's own
      guidance rules out: the second layer has nothing legible to refract.
    -->
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

      <!-- One grouped pill rather than three separate translucent controls. -->
      <div class="header-cluster flex items-center gap-2 rounded-chip border border-border-strong/50 bg-surface/70 py-1 pl-3 pr-1.5">
        <span v-if="displayName" class="flex items-center gap-1.5 text-sm text-muted">
          <AppIcon name="shield" :size="14" />
          {{ displayName }}
        </span>

        <!-- A segmented control of pressed buttons rather than a radio group:
             the state is exposed per control with aria-pressed and the group
             carries the accessible name, which survives being embedded in a
             header without relying on attribute pass-through. -->
        <div class="flex items-center gap-[2px] rounded-chip p-[3px]" role="group" aria-label="Colour theme">
          <button
            v-for="theme in themes"
            :key="theme.value"
            type="button"
            class="cursor-pointer rounded-chip border-0 bg-transparent px-2.5 py-1 text-xs font-semibold text-muted hover:text-ink"
            :class="{ 'bg-surface font-bold text-ink shadow-sm': ui.themePreference === theme.value }"
            :aria-pressed="ui.themePreference === theme.value"
            @click="ui.setThemePreference(theme.value)"
          >
            {{ theme.label }}
          </button>
        </div>

        <AppButton v-if="auth.isAuthenticated" variant="secondary" icon="sign-out" @click="logout">Sign out</AppButton>
      </div>
    </header>

    <main id="main-content" class="mx-auto w-[min(1100px,calc(100%_-_2rem))] pt-10 pb-16">
      <slot />
    </main>
  </div>
</template>
