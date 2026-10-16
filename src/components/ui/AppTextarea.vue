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
    class="w-full resize-y rounded-[10px] border border-border-strong bg-bg px-3.5 py-3 font-mono text-[12.5px] max-sm:text-[16px] leading-[1.85] text-ink placeholder:font-sans placeholder:text-faint focus-visible:border-accent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
    @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  ></textarea>
</template>
