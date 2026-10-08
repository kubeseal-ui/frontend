<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * A status message.
 *
 * The role follows the tone rather than being fixed: an error or a warning
 * interrupts, so it is `role="alert"`; an informational or success note does
 * not, so it is `role="status"`. Both are announced; only the first is
 * assertive, which matters because these panels appear next to a form the user
 * is mid-way through.
 *
 * The close control carries an explicit name — it is icon-only, so without one
 * it would be an unnamed button in the accessibility sweep.
 */
const props = withDefaults(
  defineProps<{
    type?: 'info' | 'success' | 'warning' | 'error'
    title?: string
    closable?: boolean
  }>(),
  { type: 'info', title: '', closable: false },
)

defineEmits<{ close: [] }>()

const TONES: Record<string, { frame: string; icon: string }> = {
  info: { frame: 'border-info/40 text-info', icon: 'info' },
  success: { frame: 'border-success/40 text-success', icon: 'check' },
  warning: { frame: 'border-warning/40 text-warning', icon: 'alert' },
  error: { frame: 'border-danger/40 text-danger', icon: 'alert' },
}

const tone = computed(() => TONES[props.type])
const interrupts = computed(() => props.type === 'error' || props.type === 'warning')
</script>

<template>
  <div
    :role="interrupts ? 'alert' : 'status'"
    class="flex items-start gap-2.5 rounded-card-inner border bg-surface-raised/70 px-4 py-3"
    :class="tone.frame"
  >
    <AppIcon :name="tone.icon" :size="17" class="mt-0.5" />

    <div class="min-w-0 flex-1 text-[0.95rem] text-ink">
      <strong v-if="title" class="block font-semibold">{{ title }}</strong>
      <slot />
    </div>

    <button
      v-if="closable"
      type="button"
      aria-label="Dismiss"
      class="-mr-1 cursor-pointer rounded-chip border-0 bg-transparent p-1 text-muted hover:text-ink"
      @click="$emit('close')"
    >
      <AppIcon name="x" :size="15" />
    </button>
  </div>
</template>
