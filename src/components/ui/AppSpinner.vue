<script setup lang="ts">
// With a `label` it is a live region announcing the wait; without one it is decorative.
// It renders no text in either form: the specs find buttons by exact text, so a spinner
// contributing a word would break every one of them.
withDefaults(defineProps<{ label?: string; size?: number }>(), { size: 14 })
</script>

<template>
  <span
    :role="label ? 'status' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    :style="{ width: `${size}px`, height: `${size}px` }"
    class="inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent align-[-0.125em]"
  />
</template>
