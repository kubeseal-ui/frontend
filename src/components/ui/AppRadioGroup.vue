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
  <div role="radiogroup" :aria-label="ariaLabel || label || undefined" class="flex flex-wrap gap-x-4 gap-y-1">
    <!-- A group of options with no visible question is a set of answers to nothing; the
         caption is also the group's accessible name, so the two cannot drift apart. -->
    <span v-if="label" class="w-full text-[13px] font-semibold text-ink">{{ label }}</span>
    <label
      v-for="option in options"
      :key="option.value"
      class="inline-flex items-center gap-1.5 text-[12.5px] text-muted"
      :class="disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'"
    >
      <!-- The platform's own radio, tinted. `appearance-none` would mean redrawing the
           unchecked circle from `color-scheme` by hand for no gain: this control is one
           dot, and every browser already draws it against the right theme. -->
      <input
        type="radio"
        :name="name"
        :value="option.value"
        :checked="modelValue === option.value"
        :disabled="disabled"
        class="m-0 size-3.5 shrink-0 accent-accent"
        @change="$emit('update:modelValue', option.value)"
      />
      {{ option.label }}
    </label>
  </div>
</template>
