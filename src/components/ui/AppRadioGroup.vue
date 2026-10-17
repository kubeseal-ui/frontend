<script setup lang="ts">
// Real radios inside `<label>`s so the browser supplies arrow keys, one tab stop, and the announcement; `w-fit` keeps a flex-col parent from stretching the segmented pill.
withDefaults(
  defineProps<{
    modelValue: string
    name: string
    options: { label: string; value: string }[]
    ariaLabel?: string
    label?: string
    disabled?: boolean
    variant?: 'list' | 'segmented'
  }>(),
  { ariaLabel: '', label: '', disabled: false, variant: 'list' },
)

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div
    role="radiogroup"
    :aria-label="ariaLabel || label || undefined"
    :class="
      variant === 'segmented'
        ? 'inline-flex w-fit shrink-0 items-center gap-[3px] rounded-[9px] border border-border-strong bg-bg p-[3px]'
        : 'flex flex-wrap gap-x-4 gap-y-1'
    "
  >
    <!-- A group of options with no visible question is answers to nothing; the caption is also the group's accessible name. -->
    <span v-if="label" class="w-full text-[13px] font-semibold text-ink">{{ label }}</span>
    <label
      v-for="option in options"
      :key="option.value"
      :class="
        variant === 'segmented'
          ? [
              'whitespace-nowrap rounded-[6px] px-2.5 py-[3px] text-xs font-semibold',
              modelValue === option.value ? 'bg-surface-raised text-accent' : 'text-muted',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:text-ink',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
            ]
          : [
              'inline-flex items-center gap-1.5 text-[12.5px] text-muted',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            ]
      "
    >
      <!-- The platform's own radio, tinted: `appearance-none` would mean redrawing the unchecked circle for no gain. -->
      <input
        type="radio"
        :name="name"
        :value="option.value"
        :checked="modelValue === option.value"
        :disabled="disabled"
        :class="variant === 'segmented' ? 'sr-only' : 'm-0 size-3.5 shrink-0 accent-accent'"
        @change="$emit('update:modelValue', option.value)"
      />
      {{ option.label }}
    </label>
  </div>
</template>
