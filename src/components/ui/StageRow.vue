<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { refocusAfterCollapse } from '@/utils/refocus'

// One row of the workflow rail: the row the flow stands on is open, a finished one folds to its
// summary. The summary sits outside the body and is always rendered, because it carries what a
// later step depends on — the reviewed keys, the path and base commit a delivery acts on.
const props = withDefaults(defineProps<{
  title: string
  state: 'done' | 'current' | 'pending'
  summary?: string
  /** Why a stage that has not had its turn is closed. */
  locked?: string
  open?: boolean
}>(), { summary: '', locked: '', open: false })

const emit = defineEmits<{ 'update:open': [boolean] }>()

// Per instance, because three rows share the page and `aria-controls` has to reach its own body.
const bodyId = `stage-body-${useId()}`
const header = ref<HTMLButtonElement | null>(null)
const isPending = computed(() => props.state === 'pending')

watch(() => props.open, (opened, was) => {
  // The stage that just closed took the control pressed to advance it, so focus is on `<body>`
  // and this row is where the operator now is.
  if (opened && !was) refocusAfterCollapse(() => header.value)
}, { flush: 'post' })
</script>

<template>
  <div class="border-t border-border first:border-t-0">
    <button
      ref="header"
      type="button"
      class="flex w-full items-start gap-2.5 px-4 py-3 text-left"
      :class="isPending ? 'cursor-default' : 'cursor-pointer'"
      :disabled="isPending"
      :aria-expanded="isPending ? undefined : open"
      :aria-controls="isPending ? undefined : bodyId"
      @click="emit('update:open', !open)"
    >
      <span class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <AppIcon v-if="state === 'done'" name="check" :size="14" class="text-success" />
        <AppIcon
          v-else-if="state === 'current'"
          name="chevron-down"
          :size="14"
          class="text-accent transition-transform"
          :class="open ? '' : '-rotate-90'"
        />
        <span v-else class="h-1.5 w-1.5 rounded-full bg-border-strong" />
      </span>

      <span class="flex min-w-0 flex-1 flex-col gap-0.5">
        <span class="text-sm font-semibold" :class="isPending ? 'text-muted' : 'text-ink'">{{ title }}</span>
        <span v-if="summary || locked" class="text-sm text-muted">{{ summary || locked }}</span>
      </span>

      <span v-if="!isPending" class="shrink-0 text-xs font-medium text-accent">{{ open ? 'Hide' : 'Show' }}</span>
    </button>

    <div v-show="open" :id="bodyId" class="flex flex-col gap-3 px-4 pb-4">
      <slot />
    </div>
  </div>
</template>
