<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useColorScheme } from '@/composables/useColorScheme'

// Resolved in the root's setup so data-theme is published before the first paint:
// until the bundle runs, the stylesheet's prefers-color-scheme block governs, so there
// is no unstyled flash.
useColorScheme()

const route = useRoute()
</script>

<template>
  <AppShell>
    <RouterView v-slot="{ Component }">
      <component :is="Component" :key="route.fullPath" class="view-enter" />
    </RouterView>
  </AppShell>
</template>
