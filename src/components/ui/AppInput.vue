<script setup lang="ts">
// `aria-label` is required: these sit inside dense key rows, so they are labelled by
// attribute rather than by a wrapping element.
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
