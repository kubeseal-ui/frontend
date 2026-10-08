<script setup lang="ts">
/**
 * A multi-line field. Monospaced and spellcheck-free, because the only thing it
 * ever holds is a Kubernetes manifest.
 */
withDefaults(
  defineProps<{
    modelValue: string
    ariaLabel: string
    placeholder?: string
    rows?: number
    disabled?: boolean
  }>(),
  { placeholder: '', rows: 8, disabled: false },
)

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <textarea
    :value="modelValue"
    :aria-label="ariaLabel"
    :placeholder="placeholder"
    :rows="rows"
    :disabled="disabled"
    autocomplete="off"
    spellcheck="false"
    class="field resize-y font-mono leading-relaxed"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  ></textarea>
</template>
