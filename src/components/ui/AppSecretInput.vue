<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * A password field with a reveal control.
 *
 * The value is masked by default and the control is a real `type="password"`
 * input, so the plaintext is never in the DOM as text and is not offered back
 * by autofill. Revealing swaps the input's type in place rather than copying
 * the value somewhere visible — nothing is duplicated, so nothing has to be
 * cleaned up afterwards.
 *
 * The toggle is a button with its own accessible name: it is icon-only, so
 * without one it would be an unnamed control in the accessibility sweep.
 */
withDefaults(
  defineProps<{
    modelValue: string
    ariaLabel: string
    placeholder?: string
    readonly?: boolean
  }>(),
  { placeholder: '', readonly: false },
)

defineEmits<{ 'update:modelValue': [value: string] }>()

const shown = ref(false)
</script>

<template>
  <span class="relative flex min-w-[11rem] flex-1 items-center">
    <input
      :value="modelValue"
      :type="shown ? 'text' : 'password'"
      :aria-label="ariaLabel"
      :placeholder="placeholder"
      :readonly="readonly"
      autocomplete="off"
      spellcheck="false"
      class="field pr-11 font-mono"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />

    <button
      type="button"
      class="absolute right-1 cursor-pointer rounded-chip border-0 bg-transparent p-1.5 text-muted hover:text-ink"
      :aria-label="shown ? `Conceal ${ariaLabel}` : `Reveal ${ariaLabel}`"
      :aria-pressed="shown"
      @click="shown = !shown"
    >
      <AppIcon :name="shown ? 'eye-off' : 'eye'" :size="16" />
    </button>
  </span>
</template>
