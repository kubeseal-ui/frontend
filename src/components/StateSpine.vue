<script setup lang="ts">
import { computed } from 'vue'
import { useSecretsStore } from '@/stores/secrets'
import type { SealedSecretDetail } from '@/types'

// The spine holds the state of the change, not a second copy of the editor: which of the three
// presses have happened, what the change is still against, and what this screen is allowed to do.
const props = defineProps<{
  detail?: SealedSecretDetail
  staged: number
  baseCommit: string
  canSeal: boolean
  canReveal: boolean
  canDeliver: boolean
  canSync: boolean
}>()
const store = useSecretsStore()

// A stage is done when the store holds what it produced. Nothing here is a gate on the presses —
// the bar below owns that — so these read as history rather than as instructions.
const stages = computed(() => [
  { key: 'review', title: 'Review', done: Boolean(store.review) },
  { key: 'check', title: 'Check against the branch', done: Boolean(store.check) },
  { key: 'deliver', title: 'Deliver to Git', done: Boolean(store.delivery) },
])

// A change in flight has something to be against; with nothing staged the panel answers the other
// question, which is what this screen will let you do at all.
const inFlight = computed(() => props.staged > 0 || Boolean(store.review))

const branchHead = computed(() => props.detail?.git.base_commit || '')

const abilities = computed(() => [
  { label: 'Seal a change', allowed: props.canSeal },
  { label: 'Reveal values', allowed: props.canReveal },
  { label: 'Deliver to Git', allowed: props.canDeliver },
  ...(props.canSync ? [{ label: 'Sync to Git', allowed: true }] : []),
])
</script>

<template>
  <!-- The change's own column, not a second card: the document beside it carries the content, and
       this only states where the change stands. A rounded surface around that summary would read
       as a second object on the page. -->
  <aside aria-label="Change state" class="flex w-[258px] shrink-0 flex-col gap-[22px]">
    <div>
      <h2 class="mb-[9px] text-xs font-[650] text-muted">This change</h2>
      <!-- Keyed on whether it is done, so the mark pops at the moment the press produced it
           rather than sitting filled from the start. -->
      <div
        v-for="stage in stages"
        :key="`${stage.key}-${stage.done}`"
        class="flex items-center gap-2 py-[3px] text-[13px]"
        :class="stage.done ? 'text-ink' : 'text-muted'"
      >
        <span class="size-[7px] shrink-0 rounded-full" :class="stage.done ? 'stage-mark bg-success' : 'bg-border-strong'" />
        {{ stage.title }}
      </div>
    </div>

    <div v-if="inFlight">
      <h2 class="mb-[9px] text-xs font-[650] text-muted">Against</h2>
      <div class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
        <span class="text-muted">Base commit</span>
        <span class="font-mono text-xs text-ink">{{ baseCommit || 'Unavailable' }}</span>
      </div>
      <div class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]">
        <span class="text-muted">Branch head</span>
        <span class="font-mono text-xs text-ink">{{ branchHead || 'Unavailable' }}</span>
      </div>
    </div>

    <div v-else>
      <h2 class="mb-[9px] text-xs font-[650] text-muted">Here you can</h2>
      <div
        v-for="ability in abilities"
        :key="ability.label"
        class="flex items-baseline justify-between gap-3 py-[3px] text-[13px]"
      >
        <span class="text-muted">{{ ability.label }}</span>
        <span class="font-mono text-xs" :class="ability.allowed ? 'text-success' : 'text-danger'">{{ ability.allowed ? '✓' : '✗' }}</span>
      </div>
    </div>
  </aside>
</template>
