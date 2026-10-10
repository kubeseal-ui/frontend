<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import AppSpinner from './AppSpinner.vue'
import { type IconName } from './icons'

// The label is the default slot and nothing else joins the button's text, not even while
// loading (the spinner is an svg): the specs match buttons by exact text, so this is a
// contract. `type` defaults to "button", because an accidental submit would be a real
// defect rather than a styling one.
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    size?: 'small' | 'medium'
    // Typed from the icon set: this forwards straight to AppIcon, so a plain string would
    // push the check to a runtime lookup that renders an empty svg.
    icon?: IconName
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'secondary', size: 'medium', type: 'button', disabled: false, loading: false },
)

const VARIANTS: Record<string, string> = {
  // `text-bg`, not a fixed white: the accent is dark on the light theme and pale on
  // the dark one, so the readable foreground inverts with it.
  primary: 'border-transparent bg-accent font-semibold text-bg hover:brightness-110',
  secondary: 'border-border-strong bg-surface/70 font-medium text-ink hover:bg-surface',
  ghost: 'border-transparent bg-transparent font-medium text-accent hover:bg-surface/60',
}

const SIZES: Record<string, string> = {
  small: 'px-2.5 py-1 text-xs',
  medium: 'px-3.5 py-1.5 text-sm',
}

const classes = computed(() => [
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-chip border transition disabled:cursor-not-allowed disabled:opacity-50',
  SIZES[props.size],
  VARIANTS[props.variant],
])
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    :class="classes"
    :aria-busy="loading ? 'true' : undefined"
  >
    <AppSpinner v-if="loading" />
    <AppIcon v-else-if="icon" :name="icon" :size="size === 'small' ? 14 : 16" />
    <slot />
  </button>
</template>
