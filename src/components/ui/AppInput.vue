<script setup lang="ts">
/**
 * A single-line text field.
 *
 * `aria-label` is required rather than optional: every input in this app is
 * labelled by an attribute rather than a wrapping element, because the labels
 * are rendered inside dense key rows where a visible `<label>` would not fit.
 *
 * `autocomplete` defaults to "off" so a value is never offered back by the
 * browser. Secret-bearing fields go through AppSecretInput, which does the same.
 */
withDefaults(
  defineProps<{
    modelValue: string
    ariaLabel: string
    placeholder?: string
    type?: string
    readonly?: boolean
    disabled?: boolean
    autocomplete?: string
  }>(),
  { placeholder: '', type: 'text', readonly: false, disabled: false, autocomplete: 'off' },
)

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    :value="modelValue"
    :type="type"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :readonly="readonly"
    :disabled="disabled"
    :autocomplete="autocomplete"
    spellcheck="false"
    class="field"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
