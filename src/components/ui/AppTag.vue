<script setup lang="ts">
withDefaults(defineProps<{ tone?: 'neutral' | 'accent' }>(), { tone: 'neutral' })
</script>

<template>
  <span
    class="inline-flex items-center rounded-chip border px-2 py-0.5 text-xs font-medium"
    :class="tone === 'accent' ? 'border-accent/40 bg-accent/10 text-accent' : 'border-border bg-surface-raised text-muted'"
  >
    <slot />
  </span>
</template>
