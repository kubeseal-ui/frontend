<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import AppSpinner from './AppSpinner.vue'
import { type IconName } from './icons'

/**
 * A native button with three weights.
 *
 * The label is the default slot and nothing else is added to the button's text
 * content — not even while loading, because the spinner is an svg. The specs
 * match buttons by exact text, so this is a contract rather than a preference.
 *
 * `type` defaults to "button": every control here performs an action in place,
 * and an accidental submit would be a real defect, not a styling one.
 */
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    size?: 'small' | 'medium'
    // Typed from the icon set, not `string`: this value is forwarded straight
    // to AppIcon, so a plain string here would push the check off the call site
    // and onto a runtime lookup that renders an empty svg.
    icon?: IconName
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'secondary', size: 'medium', type: 'button', disabled: false, loading: false },
)

const VARIANTS: Record<string, string> = {
  // `text-bg` rather than a fixed white: the accent is a dark blue on the light
  // theme and a pale blue on the dark one, so the readable foreground inverts
  // with it. A literal white would fail contrast on the dark palette.
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
