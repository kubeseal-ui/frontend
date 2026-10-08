<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import { useColorScheme } from '@/composables/useColorScheme'
import { useGlassSpecular } from '@/composables/useGlassSpecular'

// Resolving the scheme here, in the app root's setup, publishes data-theme
// before the first paint. Until the bundle runs, the stylesheet's
// prefers-color-scheme block governs, so there is no unstyled flash.
//
// There is no theme provider wrapping this: the palette lives in custom
// properties that the stylesheet swaps on its own, so the root only has to
// resolve the preference and write the attribute.
useColorScheme()

// The specular highlight is a property of the material, so it is driven from
// the root as one delegated listener rather than one per glass component.
useGlassSpecular()
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
