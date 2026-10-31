<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import AppSpinner from './AppSpinner.vue'
import { type IconName } from './icons'

// The label is the default slot and nothing else joins the button's text, not even while loading: the specs match buttons by exact text.
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost'
    size?: 'small' | 'medium'
    // Typed from the icon set: this forwards straight to AppIcon, so a plain string would render an empty svg.
    icon?: IconName
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    loading?: boolean
  }>(),
  { variant: 'secondary', size: 'medium', type: 'button', disabled: false, loading: false },
)

const VARIANTS: Record<string, string> = {
  // `text-accent-ink`, not a fixed white: the accent is dark on light and pale on dark, so the readable foreground inverts with it.
  primary: 'border-transparent bg-accent font-semibold text-accent-ink hover:brightness-95',
  secondary: 'border-border-strong bg-surface font-[550] text-ink hover:bg-surface-raised hover:border-muted',
  ghost: 'border-transparent bg-transparent font-[550] text-accent hover:bg-surface-raised',
}

const SIZES: Record<string, string> = {
  small: 'h-7 px-2.5 text-xs',
  // `h-9` and 13px are the app's control scale: the bar that presses this button sits its own control alongside at exactly these.
  medium: 'h-9 px-3.5 text-[13px]',
}

const classes = computed(() => [
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-control border transition disabled:cursor-not-allowed disabled:opacity-50',
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
