<script setup lang="ts">
/**
 * A select.
 *
 * Native on purpose. The only list in the app is a handful of Git paths from a
 * namespace policy, and a native `<select>` gives keyboard type-ahead,
 * platform-consistent pickers, and correct screen-reader announcement without
 * any of it being reimplemented.
 *
 * The wrapping `<label>` is what names the control; `hideLabel` exists for the
 * cases where the heading above already says it, and the label is then kept
 * visually hidden rather than dropped.
 */
withDefaults(
  defineProps<{
    modelValue: string
    options: { label: string; value: string }[]
    label: string
    hint?: string
    hideLabel?: boolean
  }>(),
  { hint: '', hideLabel: false },
)

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="flex flex-col gap-1 text-sm font-medium text-ink">
    <span :class="hideLabel ? 'sr-only' : ''">{{ label }}</span>
    <select
      :value="modelValue"
      class="field cursor-pointer"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
    <span v-if="hint" class="text-xs font-normal text-muted">{{ hint }}</span>
  </label>
</template>
