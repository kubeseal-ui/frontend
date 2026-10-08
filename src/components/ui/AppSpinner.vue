<script setup lang="ts">
/**
 * The busy indicator, in two forms.
 *
 * With a `label` it is a live region announcing the wait; without one it is
 * purely decorative and hidden from assistive technology.
 *
 * It renders no text in either form, and that is load-bearing: the component
 * specs find buttons by exact text (`button.text() === 'Encrypt for review'`),
 * so a spinner that contributed a word would break every one of them.
 */
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
