<script setup lang="ts">
// Native on purpose: the only list in the app is a handful of Git paths, and a native
// `<select>` gives keyboard type-ahead, platform pickers, and correct announcement free.
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
