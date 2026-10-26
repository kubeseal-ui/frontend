<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import type { WorkflowStep } from '@/types'

// The one primary button, labelled with the next press so nobody has to know the step; it does no work itself — the surface owns the
// presses, because the first needs the batch. It carries no way back: stepping back is the rail's Edit stop.
const props = defineProps<{
  step: WorkflowStep
  /** '' while the namespace has no Git mapping. */
  mode: 'direct' | 'proposal' | ''
  count: number
  ready: boolean
  busy: boolean
  /** Set when there is no next press; the bar states why rather than offering a button that is disabled or that the server would refuse. */
  idle?: string
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
  <!-- Sticky and opaque so the press is always in reach mid-scroll and the ciphertext never shows through; an idle bar flows at the content's end instead. -->
  <div
    class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg pt-3.5 pb-[max(8px,env(safe-area-inset-bottom))]"
    :class="idle ? '' : 'sticky bottom-0 z-10'"
  >
    <span v-if="idle" class="text-[12.5px] text-muted">{{ idle }}</span>
    <template v-else>
      <span class="font-mono text-xs text-muted">{{ summary }}</span>
      <AppButton
        variant="primary"
        :loading="busy"
        :disabled="!ready"
        @click="$emit('press')"
      >
        <!-- Keyed on the label, so the roll plays exactly when the step moves on. -->
        <Transition mode="out-in" enter-active-class="roll-next" leave-active-class="roll-out">
          <span :key="label">{{ label }}</span>
        </Transition>
      </AppButton>
    </template>
  </div>
</template>
