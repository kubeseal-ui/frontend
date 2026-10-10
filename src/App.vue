<script setup lang="ts">
import AppShell from '@/components/AppShell.vue'
import { useColorScheme } from '@/composables/useColorScheme'
import { useGlassSpecular } from '@/composables/useGlassSpecular'

// Resolved in the root's setup so data-theme is published before the first paint:
// until the bundle runs, the stylesheet's prefers-color-scheme block governs, so there
// is no unstyled flash.
useColorScheme()

// One delegated listener rather than one per glass component.
useGlassSpecular()
</script>

<template>
  <AppShell>
    <RouterView />
  </AppShell>
</template>
