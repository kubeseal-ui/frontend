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
       this only states where the change stands. The workflow stages themselves live in the rail
       above the editor now, so this panel no longer repeats them — it answers what the change is
       against, and what this screen is allowed to do. -->
  <aside aria-label="Change state" class="flex w-[258px] shrink-0 flex-col gap-[22px]">
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
