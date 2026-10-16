<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import { useColorScheme } from '@/composables/useColorScheme'

// Resolved in the root's setup so data-theme is published before the first paint:
// until the bundle runs, the stylesheet's prefers-color-scheme block governs, so there
// is no unstyled flash.
useColorScheme()

const route = useRoute()
// Keyed on the name, not the path: a param change (namespace switcher, secret to secret)
// must reuse the mounted view rather than tear the page down and replay the entrance.
const enterKey = computed(() => route.matched[0]?.name ?? route.fullPath)
</script>

<template>
  <AppShell>
    <RouterView v-slot="{ Component }">
      <component :is="Component" :key="enterKey" class="view-enter" />
    </RouterView>
  </AppShell>
</template>
