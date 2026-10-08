<script setup lang="ts">
/**
 * A group of native radios.
 *
 * Real `<input type="radio">` elements inside `<label>`s, rather than styled
 * divs: the browser then supplies arrow-key movement within the group, the
 * single-tab-stop behaviour, and the checked-state announcement for free. The
 * label wrapper is also what gives each input its accessible name.
 *
 * The group carries `role="radiogroup"` with a name of its own, so the set is
 * announced as one control with a purpose rather than as three loose radios.
 */
withDefaults(
  defineProps<{
    modelValue: string
    name: string
    options: { label: string; value: string }[]
    ariaLabel?: string
    disabled?: boolean
  }>(),
  { ariaLabel: '', disabled: false },
)

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <div role="radiogroup" :aria-label="ariaLabel || undefined" class="flex flex-wrap items-center gap-x-3 gap-y-1">
    <label
      v-for="option in options"
      :key="option.value"
      class="flex cursor-pointer items-center gap-1.5 text-sm"
      :class="disabled ? 'cursor-not-allowed opacity-60' : ''"
    >
      <input
        type="radio"
        :name="name"
        :value="option.value"
        :checked="modelValue === option.value"
        :disabled="disabled"
        class="size-3.5 accent-[var(--app-accent)]"
        @change="$emit('update:modelValue', option.value)"
      />
      {{ option.label }}
    </label>
  </div>
</template>
