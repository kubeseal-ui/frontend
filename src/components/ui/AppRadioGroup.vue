<script setup lang="ts">
// Real radios inside `<label>`s rather than styled divs, so the browser supplies the arrow keys,
// the single tab stop, and the checked announcement. `w-fit` is load-bearing on the segmented
// variant: both call sites put the group in a `flex-col`, whose `align-items: stretch` would
// otherwise override `inline-flex` and draw the pill across the whole track rather than around its
// segments. The dot is `sr-only` rather than removed — the input stays the control, and
// `has-[:focus-visible]` moves the ring out to the segment, since a clipped input's outline goes
// with it.
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
