<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { requiredDeliveryCapability } from '@/utils/delivery'
import { driftPresentation } from '@/utils/drift'
import type { SealedSecretDetail } from '@/types'

// The spine holds the state of the change, not a second copy of the editor: where it is going,
// what can be done here, and which of the three presses have already happened.
const props = defineProps<{ namespace: string; detail?: SealedSecretDetail }>()
const auth = useAuthStore()
const store = useSecretsStore()

const mode = computed(() => props.detail?.git.delivery_mode || store.namespaceDeliveryMode(props.namespace))
const paths = computed(() => store.namespaceGitPaths(props.namespace))
// What the change is made against and where it lands. The dry run's own answer wins, because
// that is the destination the server actually verified.
const base = computed(() => store.review?.baseCommit || store.change?.baseCommit || props.detail?.git.base_commit || '')
const target = computed(() => store.check?.result.path || store.review?.targetPath || props.detail?.git.file_path || '')

const driftState = computed(() => props.detail?.git.drift || (props.detail?.git.in_sync_with_live ? 'in-sync' : 'unknown'))
// Drift withholds revealing, sealing and delivery on this page whatever the namespace grants, so
// these answer what can be done here; the sentence below names the reason. With no detail there
// is no drift to read, so no claim is made.
const inSync = computed(() => !props.detail || driftState.value === 'in-sync')
const canSeal = computed(() => inSync.value && auth.hasCapability(props.namespace, 'secret:seal'))
const canReveal = computed(() => inSync.value && auth.hasCapability(props.namespace, 'secret:decrypt'))
const deliverCapability = computed(() => requiredDeliveryCapability(mode.value))
const canDeliver = computed(() =>
  inSync.value && (deliverCapability.value ? auth.hasCapability(props.namespace, deliverCapability.value) : false))

const drift = computed(() => (props.detail ? driftPresentation(driftState.value) : null))

// A stage is done when the store holds what it produced. Nothing here is a gate on the presses —
// the bar below owns that — so these read as history rather than as instructions.
const stages = computed(() => [
  { key: 'review', title: 'Review', done: Boolean(store.review), skipped: !props.detail },
  { key: 'check', title: 'Check', done: Boolean(store.check), skipped: false },
  { key: 'deliver', title: 'Deliver', done: Boolean(store.delivery), skipped: false },
])
</script>

<template>
  <aside aria-label="Change state" class="glass flex flex-col gap-4 rounded-card p-4 lg:sticky lg:top-24">
    <div>
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Destination</h2>
      <dl class="m-0 flex flex-col gap-2 text-sm">
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted">File</dt>
          <dd class="m-0 break-all font-mono text-xs">{{ target || 'Resolved by the check' }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted">Base commit</dt>
          <dd class="m-0 break-all font-mono text-xs">{{ base || 'Unavailable' }}</dd>
        </div>
        <div class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted">Delivery</dt>
          <dd class="m-0">{{ mode || 'Not mapped' }}</dd>
        </div>
        <div v-if="paths?.branch" class="flex flex-col gap-0.5">
          <dt class="text-xs text-muted">Branch</dt>
          <dd class="m-0 break-all font-mono text-xs">{{ paths.branch }}</dd>
        </div>
      </dl>
    </div>

    <div class="border-t border-border pt-4">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">Here you can</h2>
      <ul class="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
        <li class="flex items-center gap-1.5">
          <AppIcon :name="canSeal ? 'check' : 'x'" :size="13" :class="canSeal ? 'text-success' : 'text-danger'" />
          Seal a change
        </li>
        <li class="flex items-center gap-1.5">
          <AppIcon :name="canReveal ? 'check' : 'x'" :size="13" :class="canReveal ? 'text-success' : 'text-danger'" />
          Reveal values
        </li>
        <li class="flex items-center gap-1.5">
          <AppIcon :name="canDeliver ? 'check' : 'x'" :size="13" :class="canDeliver ? 'text-success' : 'text-danger'" />
          {{ mode ? `Deliver (${deliverCapability})` : 'Deliver' }}
        </li>
      </ul>
    </div>

    <div class="border-t border-border pt-4">
      <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">This change</h2>
      <ol class="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
        <li v-for="stage in stages" :key="stage.key" class="flex items-center gap-1.5">
          <AppIcon v-if="stage.done" name="check" :size="13" class="text-success" />
          <span v-else class="inline-block size-1.5 rounded-full bg-border-strong" />
          <span :class="stage.done ? 'text-ink' : 'text-muted'">{{ stage.title }}</span>
        </li>
      </ol>
    </div>

    <p v-if="drift && drift.label !== 'In sync'" class="m-0 flex items-start gap-1.5 border-t border-border pt-4 text-sm text-muted">
      <AppIcon name="alert" :size="13" class="mt-0.5 shrink-0" />
      <span>Git status: {{ drift.label }}. Reveal, editing and delivery are disabled until it is resolved.</span>
    </p>
  </aside>
</template>
