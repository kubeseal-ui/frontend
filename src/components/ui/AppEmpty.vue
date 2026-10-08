<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/**
 * An empty result. The description is prose rather than a terse label, because
 * every place this appears is explaining why there is nothing to show — which
 * is the whole job of the element.
 */
withDefaults(defineProps<{ description: string; icon?: string }>(), { icon: 'namespace' })
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-card-inner border border-dashed border-border px-6 py-10 text-center">
    <AppIcon :name="icon" :size="26" class="text-muted/70" />
    <p class="m-0 max-w-prose text-sm text-muted">{{ description }}</p>
  </div>
</template>
