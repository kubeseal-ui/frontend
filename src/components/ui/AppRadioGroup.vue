<script setup lang="ts">
// Real radios inside `<label>`s rather than styled divs, so the browser supplies
// arrow-key movement, the single tab stop, and the checked-state announcement.
withDefaults(
  defineProps<{
    modelValue: string
    name: string
    options: { label: string; value: string }[]
    ariaLabel?: string
    label?: string
    disabled?: boolean
  }>(),
  { ariaLabel: '', label: '', disabled: false },
)

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div role="radiogroup" :aria-label="ariaLabel || label || undefined" class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <!-- A group of options with no visible question is a set of answers to nothing; the
         caption is also the group's accessible name, so the two cannot drift apart. -->
    <span v-if="label" class="w-full text-sm font-medium text-ink">{{ label }}</span>
    <label
      v-for="option in options"
      :key="option.value"
      class="flex cursor-pointer items-center gap-1.5 text-sm"
      :class="disabled ? 'cursor-not-allowed opacity-60' : ''"
    >
      <!-- `accent-color` could only tint the checked state: the unchecked circle is drawn
           by the platform from `color-scheme`, not our palette. `appearance-none` takes
           the control over while it stays a real input[type=radio], so the keyboard and
           screen-reader behaviour above stands. -->
      <input
        type="radio"
        :name="name"
        :value="option.value"
        :checked="modelValue === option.value"
        :disabled="disabled"
        class="size-3.5 shrink-0 cursor-pointer appearance-none rounded-full border border-border-strong checked:border-4 checked:border-accent disabled:cursor-not-allowed disabled:opacity-60"
        @change="$emit('update:modelValue', option.value)"
      />
      {{ option.label }}
    </label>
  </div>
</template>
