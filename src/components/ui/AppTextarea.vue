<script setup lang="ts">
// Monospaced and spellcheck-free: the only thing it holds is a Kubernetes manifest.
withDefaults(
  defineProps<{
    modelValue: string
    ariaLabel: string
    placeholder?: string
    rows?: number
    disabled?: boolean
    invalid?: boolean
    describedBy?: string
  }>(),
  { placeholder: '', rows: 8, disabled: false, invalid: false, describedBy: '' },
)

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    :value="modelValue"
    :aria-label="ariaLabel"
    :aria-invalid="invalid || undefined"
    :aria-describedby="describedBy || undefined"
    :placeholder="placeholder"
    :rows="rows"
    :disabled="disabled"
    autocomplete="off"
    spellcheck="false"
    class="field resize-y font-mono leading-relaxed"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  ></textarea>
</template>
