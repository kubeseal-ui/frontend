<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

// The role follows the tone: an error or warning interrupts (`role="alert"`), an
// informational or success note does not (`role="status"`).
const props = withDefaults(
  defineProps<{
    type?: 'info' | 'success' | 'warning' | 'error'
    title?: string
    closable?: boolean
  }>(),
  { type: 'info', title: '', closable: false },
)

defineEmits<{ close: [] }>()

// One box, four tones: a flat surface with the tone on its left edge and its heading. It is the
// result of something the workflow did, so it sits in the column at the page's own weight rather
// than floating above it.
const TONES: Record<string, { frame: string; text: string }> = {
  info: { frame: 'border-l-info', text: 'text-info' },
  success: { frame: 'border-l-success', text: 'text-success' },
  warning: { frame: 'border-l-warning', text: 'text-warning' },
  error: { frame: 'border-l-danger', text: 'text-danger' },
}

const tone = computed(() => TONES[props.type])
const interrupts = computed(() => props.type === 'error' || props.type === 'warning')
</script>

<template>
  <!-- The 3px left edge replaces the 1px base border there, so the left padding is 2px
       lighter: both content insets land at 16px. -->
  <div
    :role="interrupts ? 'alert' : 'status'"
    class="flex flex-col gap-[7px] rounded-[10px] border border-l-[3px] border-border bg-surface pr-[15px] pl-[13px] py-[14px]"
    :class="tone.frame"
  >
    <h3 v-if="title" class="m-0 text-[13.5px] font-[650]" :class="tone.text">{{ title }}</h3>
    <slot />

    <button
      v-if="closable"
      type="button"
      aria-label="Dismiss"
      class="cursor-pointer self-start rounded-mini border border-border-strong bg-transparent px-2 py-0.5 text-xs text-muted hover:text-ink"
      @click="$emit('close')"
    >
      <AppIcon name="x" :size="12" />
    </button>
  </div>
</template>
