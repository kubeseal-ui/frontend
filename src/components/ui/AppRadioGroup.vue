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
      <!-- `accent-color` alone could only ever tint the checked state: the
           unchecked circle is drawn by the platform from `color-scheme`, not
           from our palette, so on a dark card it rendered as the browser's own
           grey rather than our border token. `appearance-none` takes the whole
           control over — the ring is `border-border-strong`, and checking it
           widens that border to 4px in the accent colour, which leaves the
           centre showing the surface behind it. That is the ordinary radio
           read, drawn entirely from tokens.

           The element stays a real `input[type=radio]`: the browser keeps the
           arrow-key movement, the single tab stop, and the checked-state
           announcement, and editor-accessibility.spec.ts still finds it by
           value. The focus ring is the global `:focus-visible` rule. -->
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
