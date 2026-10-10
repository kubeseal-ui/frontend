<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

// Masking is a real `type="password"` input and revealing swaps the type in place, so the
// plaintext is never rendered as text or offered to autofill.
withDefaults(
  defineProps<{
    modelValue: string
    ariaLabel: string
    placeholder?: string
    readonly?: boolean
    // The field announces its own error; the row around it carries the colour and the text.
    invalid?: boolean
    describedBy?: string
  }>(),
  { modelValue: '', placeholder: '', readonly: false, invalid: false, describedBy: '' },
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
      :aria-invalid="invalid || undefined"
      :aria-describedby="describedBy || undefined"
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
