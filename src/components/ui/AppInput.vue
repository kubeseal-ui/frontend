<script setup lang="ts">
// `aria-label` is required: the accessible name belongs to the caller, which may place this
// inside a `<label>` of its own rather than let the component own the markup.
withDefaults(
  defineProps<{
    modelValue: string
    ariaLabel: string
    placeholder?: string
    type?: string
    readonly?: boolean
    disabled?: boolean
    autocomplete?: string
    invalid?: boolean
    describedBy?: string
  }>(),
  { placeholder: '', type: 'text', readonly: false, disabled: false, autocomplete: 'off', invalid: false, describedBy: '' },
)

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <input
    :value="modelValue"
    :type="type"
    :aria-label="ariaLabel"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy || undefined"
    :placeholder="placeholder"
    :readonly="readonly"
    :disabled="disabled"
    :autocomplete="autocomplete"
    spellcheck="false"
    class="field"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>
