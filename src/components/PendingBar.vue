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
  /** Set when there is no next press. The bar states why rather than offering a button that is
   *  disabled (nothing staged) or that the server would refuse (the change already landed). */
  idle?: string
  /** True once a review or check exists and nothing has been delivered: the operator can step
   *  back to editing. The bar offers "Start over" beside the forward press. */
  canBack?: boolean
}>()

defineEmits<{ press: []; back: [] }>()

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
       control on the screen the least legible thing on it. -->
  <div class="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-bg pt-3.5 pb-2">
    <span v-if="idle" class="text-[12.5px] text-muted">{{ idle }}</span>
    <template v-else>
      <span class="font-mono text-xs text-muted">{{ summary }}</span>
      <div class="flex items-center gap-2.5">
        <!-- The way back from a review or check: forward is one press, so stepping back needs its
             own control rather than being left to the browser's Back. Ghost-weighted so the
             forward press stays the one primary thing on the bar. -->
        <button
          v-if="canBack"
          type="button"
          class="inline-flex h-9 cursor-pointer items-center rounded-control border border-border-strong bg-transparent px-3.5 text-[13px] font-semibold text-muted hover:bg-surface hover:text-ink"
          @click="$emit('back')"
        >Start over</button>
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
      </div>
    </template>
  </div>
</template>
