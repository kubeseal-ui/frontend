<script setup lang="ts">
/**
 * A small pill. Used for the scope badge and for the concealed-value marker.
 *
 * The tone prop exists so the tag can borrow a semantic colour without the
 * caller writing a class — but it is only ever additive: the label text is
 * what carries the meaning.
 */
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
