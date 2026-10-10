<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import type { WorkflowStep } from '@/types'

// The one primary button, and the only primary button on the screen. Its label is always the
// next press, so nobody has to know which step of the workflow they are standing on — the step
// is computed above it and passed in. It does no work itself: the surface owns the presses,
// because the first one needs the batch the editor is holding.
const props = defineProps<{
  step: WorkflowStep
  /** '' while the namespace has no Git mapping. */
  mode: 'direct' | 'proposal' | ''
  count: number
  ready: boolean
  busy: boolean
}>()

defineEmits<{ press: [] }>()

const LABELS: Record<WorkflowStep, string> = {
  review: 'Review change',
  'apply-check': 'Apply & check',
  check: 'Check against branch',
  deliver: 'Deliver to Git',
}

const label = computed(() =>
  props.step === 'deliver' && props.mode === 'proposal' ? 'Create proposal' : LABELS[props.step])

const summary = computed(() => (props.count === 1 ? '1 change' : `${props.count} changes`))
</script>

<template>
  <div class="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 border-t border-border bg-bg/90 pt-3 pb-2 backdrop-blur">
    <span class="text-sm text-muted">{{ summary }}</span>
    <AppButton
      class="ml-auto"
      variant="primary"
      icon="lock"
      :loading="busy"
      :disabled="!ready"
      @click="$emit('press')"
    >{{ label }}</AppButton>
  </div>
</template>
