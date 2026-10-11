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
  <label class="flex flex-col gap-[7px] text-[13px] font-semibold text-ink">
    <span :class="hideLabel ? 'sr-only' : ''">{{ label }}</span>
    <select
      :value="modelValue"
      class="h-8 w-full cursor-pointer rounded-[8px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] text-ink focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
    <span v-if="hint" class="font-mono text-[11.5px] font-normal text-faint">{{ hint }}</span>
  </label>
</template>
