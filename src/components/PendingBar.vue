<script setup lang="ts">
import { computed } from 'vue'
import AppButton from '@/components/ui/AppButton.vue'
import type { WorkflowStep } from '@/types'

// The one primary button, and the only primary button on the screen. Its label is always the
// next press, so nobody has to know which step of the workflow they are standing on — the step
// is computed above it and passed in. It does no work itself: the surface owns the presses,
// because the first one needs the batch the editor is holding.
//
// It carries no way back. Stepping back is the rail's own Edit stop, so the bar is one press and
// nothing else: a second control here doing the same thing would have to be read and ruled out
// before every press, and the workflow's direction is what the bar exists to state.
const props = defineProps<{
  step: WorkflowStep
  /** '' while the namespace has no Git mapping. */
  mode: 'direct' | 'proposal' | ''
  count: number
  ready: boolean
  busy: boolean
  /** Set when there is no next press. The bar states why rather than offering a button that is
   *  disabled (nothing staged) or that the server would refuse (the change already landed). */
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
  <!-- The next press, and only ever one of them: no toolbar to work out the order of. Sticky and
       opaque, because a bar that let the ciphertext show through it would make the one primary
       control on the screen the least legible thing on it. The stickiness exists so the press is
       always in reach mid-scroll; an idle bar has no press, so it flows at the content's end
       rather than gluing a sentence to the viewport's bottom edge. -->
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
        <!-- Keyed on the label, so the roll plays exactly when the step moves on: the label it
             replaces leaves upward and the next arrives from below, because the flow only ever
             moves one way. -->
        <Transition mode="out-in" enter-active-class="roll-next" leave-active-class="roll-out">
          <span :key="label">{{ label }}</span>
        </Transition>
      </AppButton>
    </template>
  </div>
</template>
