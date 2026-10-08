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

const themes: { value: ThemePreference; label: string; icon: string }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'monitor' },
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
             header without relying on attribute pass-through.

             The track is filled and the button carries no background of its own
             until it is selected, and both halves are load-bearing. The cluster
             is bg-surface/70 and the selected chip is bg-surface — the same
             colour one alpha step apart, about 1/255 against each other. With
             no track the chip has nothing to contrast against and the control
             reads as three loose words.

             Each state is one class list rather than a static list plus an
             override: two utilities on the same property are resolved by
             stylesheet order, not by the order they appear in the attribute.

             Each button is its glyph alone, so the word has to live somewhere
             else: `aria-label` names the control for a screen reader, and
             `title` is what a pointer user gets on hover. AppIcon is
             `aria-hidden` and renders no text node, so without the label
             attribute these three buttons would have no accessible name at all.
             That is also what app-shell.spec.ts now locates them by.

             Glyph-only is only safe because the three are unambiguous: sun and
             moon are read as light and dark without a legend, and the display
             is the standing mnemonic for "whatever the system is doing" — the
             one state that has no conventional glyph and so the one where the
             hover label is doing real work rather than restating the obvious.

             The font-weight classes went with the words — weight says nothing
             about an icon. The state is still carried by fill and by the
             selected chip's shadow, and still exposed with aria-pressed. -->
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
                ? 'bg-surface text-ink shadow-sm'
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

    <main id="main-content" class="mx-auto w-[min(1100px,calc(100%_-_2rem))] pt-10 pb-16">
      <slot />
    </main>
  </div>
</template>
