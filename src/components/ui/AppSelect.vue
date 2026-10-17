<script setup lang="ts">
// Native on purpose: a handful of Git paths wants keyboard type-ahead, platform pickers, and correct announcement for free.
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
  <label class="flex flex-col gap-[6px] text-[12px] font-[650] text-ink">
    <span :class="hideLabel ? 'sr-only' : ''">{{ label }}</span>
    <select
      :value="modelValue"
      class="h-8 w-full cursor-pointer rounded-[8px] border border-border-strong bg-bg px-2.5 font-mono text-[13px] max-sm:text-[14px] text-ink focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
      @change="$emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="option in options" :key="option.value" :value="option.value">{{ option.label }}</option>
    </select>
    <span v-if="hint" class="font-mono text-[11px] font-normal text-faint">{{ hint }}</span>
  </label>
</template>
