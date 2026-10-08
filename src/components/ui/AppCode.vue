<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/**
 * A ciphertext block.
 *
 * The heading is not decorative: several of these stack inside the delivery
 * panel, and without a label a reader cannot tell the before from the after.
 * The block scrolls rather than wraps, because a wrapped manifest line reads as
 * a different manifest line.
 */
defineProps<{ code: string; label?: string }>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1">
    <span v-if="label" class="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
      <AppIcon name="lock" :size="13" />
      {{ label }}
    </span>
    <pre class="m-0 max-h-72 overflow-auto rounded-card-inner border border-border bg-surface-raised/70 p-3 text-xs leading-relaxed"><code class="font-mono whitespace-pre">{{ code }}</code></pre>
  </div>
</template>
