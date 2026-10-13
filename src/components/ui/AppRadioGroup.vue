<script setup lang="ts">
// Real radios inside `<label>`s rather than styled divs, so the browser supplies
// arrow-key movement, the single tab stop, and the checked-state announcement. The two
// variants draw the same control differently and nothing else: `list` shows each option's
// dot beside its name, `segmented` is the pill where the name *is* the segment. The radio is
// still the control in both — `sr-only` hides the dot without taking it out of the tab order
// or off the arrow keys, and the ring moves to the segment with `has-[:focus-visible]`, so a
// keyboard user sees the focus the browser put on the input.
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
        ? 'inline-flex shrink-0 items-center gap-[3px] rounded-[9px] border border-border-strong bg-bg p-[3px]'
        : 'flex flex-wrap gap-x-4 gap-y-1'
    "
  >
    <!-- A group of options with no visible question is a set of answers to nothing; the
         caption is also the group's accessible name, so the two cannot drift apart. -->
    <span v-if="label" class="w-full text-[13px] font-semibold text-ink">{{ label }}</span>
    <label
      v-for="option in options"
      :key="option.value"
      :class="
        variant === 'segmented'
          ? [
              'whitespace-nowrap rounded-[6px] px-2.5 py-[3px] text-xs font-semibold',
              modelValue === option.value ? 'bg-surface text-accent' : 'text-muted',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:text-ink',
              'has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
            ]
          : [
              'inline-flex items-center gap-1.5 text-[12.5px] text-muted',
              disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
            ]
      "
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
        :class="variant === 'segmented' ? 'sr-only' : 'm-0 size-3.5 shrink-0 accent-accent'"
        @change="$emit('update:modelValue', option.value)"
      />
      {{ option.label }}
    </label>
  </div>
</template>
