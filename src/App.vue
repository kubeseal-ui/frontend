<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useColorScheme } from '@/composables/useColorScheme'

// Resolved in the root's setup so data-theme is published before the first paint; until the bundle runs, the stylesheet's prefers-color-scheme block governs.
useColorScheme()

const route = useRoute()
// Keyed on the name, not the path, so a param change reuses the mounted view rather than replaying the entrance.
const enterKey = computed(() => route.matched[0]?.name ?? route.fullPath)
</script>

<template>
  <AppShell>
    <RouterView v-slot="{ Component }">
      <component :is="Component" :key="enterKey" class="view-enter" />
    </RouterView>
  </AppShell>
</template>
