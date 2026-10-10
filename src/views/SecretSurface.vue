<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
import AppTag from '@/components/ui/AppTag.vue'
import DiffBlocks from '@/components/DiffBlocks.vue'
import DocumentEditor from '@/components/DocumentEditor.vue'
import KeyRows from '@/components/KeyRows.vue'
import PendingBar from '@/components/PendingBar.vue'
import StateSpine from '@/components/StateSpine.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { deliveryHeading, requiredDeliveryCapability, summarizeDelivery } from '@/utils/delivery'
import { driftPresentation } from '@/utils/drift'
import { countLabel } from '@/utils/format'
import type { DeliveryResult, Mutation, WorkflowStep } from '@/types'

// One screen per Secret. The document is always visible and editable — no fold, no tray, no
// second page — and the three presses all come from the one button at its foot.
const route = useRoute(); const auth = useAuthStore(); const store = useSecretsStore(); const router = useRouter()
const loading = ref(true); const error = ref('')
const pressError = ref(''); const busy = ref(false)

/** The rows the editor is holding. Only the first press reads it, which is why it stays here
 *  rather than being mirrored into the store on every keystroke. */
const batch = ref<Mutation[]>([])
const editor = ref<InstanceType<typeof KeyRows> | null>(null)

const namespace = () => String(route.params.namespace)
const name = () => String(route.params.name)
const detail = computed(() => store.currentDetail)

// A mode switch, not a route: the URL carries it so a reload lands where the operator was, but
// moving between the two modes must not refetch the Secret.
const mode = computed<'rows' | 'yaml'>(() => (route.query.mode === 'yaml' ? 'yaml' : 'rows'))
function setMode(next: 'rows' | 'yaml') {
  router.replace({ query: { ...route.query, mode: next } })
}

const scoped = (capability: 'secret:seal' | 'secret:decrypt' | 'gitops:push' | 'gitops:propose') =>
  auth.hasCapability(namespace(), capability)
const canPatch = computed(() => Boolean(detail.value?.git.in_sync_with_live) && scoped('secret:seal') && scoped('secret:decrypt'))
const baseCommit = computed(() => detail.value?.git.base_commit || '')
const deliveryMode = computed(() => detail.value?.git.delivery_mode || store.namespaceDeliveryMode(namespace()))
const canDeliver = computed(() => {
  const required = requiredDeliveryCapability(deliveryMode.value)
  return required ? auth.hasCapability(namespace(), required) : false
})

const title = computed(() => detail.value?.name || name())
const driftStatus = () => {
  const git = detail.value?.git
  return git?.drift || (git?.in_sync_with_live ? 'in-sync' : 'unknown')
}
const driftLabel = computed(() => driftPresentation(driftStatus()).label)

// --- The three presses -----------------------------------------------------
const step = computed<WorkflowStep>(() => {
  if (!store.review) return 'review'
  if (!store.check) return 'apply-check'
  return 'deliver'
})

// Withheld when the batch is empty, and by capability and drift — the page's own gate, stated above
// the content it disables. A press the server would refuse for any other reason is answered by the
// refusal rather than by a dead button explaining itself.
const ready = computed(() => {
  if (step.value === 'review') return batch.value.length > 0 && canPatch.value && baseCommit.value !== ''
  if (step.value === 'deliver') return canDeliver.value
  return true
})

// A press is offered only when there is a next one. A landed delivery is the terminal case: the
// store drops the change it consumed, and pressing again would meet a base-commit conflict.
const idle = computed(() => {
  if (store.delivery) return 'Delivered. Change another key to run the workflow again.'
  if (step.value === 'review' && batch.value.length === 0) {
    return 'Nothing staged. Change, remove, or add a key to begin.'
  }
  return ''
})

async function press() {
  if (!ready.value) return
  pressError.value = ''
  // An incomplete batch is the operator asking what is missing, so every row answers at once
  // and nothing is sent.
  if (step.value === 'review' && editor.value?.batchProblem) { editor.value.showProblems(); return }
  busy.value = true
  try {
    if (step.value === 'review') {
      store.stageChange({
        namespace: namespace(), name: name(), mutations: batch.value,
        baseCommit: baseCommit.value, targetPath: detail.value?.git.file_path,
        scope: detail.value?.scope || 'strict',
      })
      await store.reviewChange()
    } else if (step.value === 'apply-check') await store.applyAndCheck()
    else await store.deliverChange()
  } catch (e) {
    pressError.value = describeError(e, 'The workflow could not be advanced')
  } finally { busy.value = false }
}

// A delivery consumes the staged set: the ciphertext that reached Git was built from these rows,
// so leaving them standing would show a change that has already landed.
watch(() => store.delivery, (outcome) => { if (outcome) { editor.value?.clear(); batch.value = [] } })

// --- Sync ------------------------------------------------------------------
const syncError = ref('')
const syncOutcome = ref<DeliveryResult | null>(null)
const syncing = ref(false)
// The endpoint compares this against the branch head and refuses an empty one, so an absent
// value withholds the control rather than sending an empty string. The server reports a head
// even for a manifest Git does not hold yet — exactly the live-only Secret this is for.
const syncBaseCommit = computed(() => detail.value?.git.base_commit || '')
// The live Secret still holds the version the Git file had before its last change, so the file
// has moved on and a sync would overwrite whatever replaced it.
const gitMovedAhead = computed(() => Boolean(detail.value?.git.git_moved_ahead))
const canSync = computed(() => {
  const required = requiredDeliveryCapability(detail.value?.git.delivery_mode || '')
  return required ? auth.hasCapability(namespace(), required) : false
})

// Three situations, three answers: no Git policy, no branch head, no capability.
const syncUnavailable = computed(() => {
  const mode = detail.value?.git.delivery_mode
  if (!mode) return 'This namespace has no Git delivery policy, so there is nowhere in Git for this Secret to be synced to.'
  if (!syncBaseCommit.value) return 'The Git source could not be read, so there is no branch head to sync against. Reload the page and try again.'
  return `Syncing writes to Git, which needs the ${requiredDeliveryCapability(mode)} capability in this namespace.`
})

const syncTitle = computed(() => (syncOutcome.value ? deliveryHeading(syncOutcome.value, 'Synced to Git') : ''))
const syncSummary = computed(() => (syncOutcome.value
  ? summarizeDelivery(syncOutcome.value, { verb: 'Synced', branch: detail.value?.git.branch, file: detail.value?.git.file_path })
  : ''))

async function onSync() {
  if (!detail.value || !syncBaseCommit.value) return
  syncing.value = true; syncError.value = ''; syncOutcome.value = null
  try {
    syncOutcome.value = await store.syncToGit(namespace(), name(), syncBaseCommit.value)
  } catch (e) {
    syncError.value = describeError(e, 'The live Secret could not be synced to Git')
  } finally { syncing.value = false }
}

// --- Load ------------------------------------------------------------------
async function load() {
  loading.value = true; error.value = ''
  // A route change reuses this view instance, so a stale report would otherwise render above
  // the next Secret, and a stale change would be applied to it.
  syncOutcome.value = null; syncError.value = ''; pressError.value = ''
  batch.value = []
  store.clearSensitiveState()
  try {
    await Promise.all([store.fetchDetail(namespace(), name()), store.fetchGitPaths()])
  } catch (e) {
    error.value = describeError(e, 'Unable to load this SealedSecret')
  } finally { loading.value = false }
}

onMounted(load)
// Two sources, not a getter returning an array: a fresh array never compares equal, so that form
// reloads on every route change — including the `?mode=` flip, which is meant to be a mode switch.
watch([() => route.params.namespace, () => route.params.name], load)
</script>

<template>
  <section aria-labelledby="page-title" class="flex flex-col">
    <RouterLink
      :to="`/namespaces/${encodeURIComponent(namespace())}`"
      class="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:underline"
    >
      <AppIcon name="chevron-left" :size="14" />
      {{ namespace() }}
    </RouterLink>

    <AppPageHeader :title="title" title-id="page-title">
      <template #eyebrow>
        <AppTag v-if="detail" tone="accent">{{ detail.scope || 'strict' }}</AppTag>
      </template>
      <template #subtitle>
        <p v-if="detail" class="m-0 text-muted">
          {{ detail.namespace }} · {{ countLabel(detail.key_count, 'encrypted key') }}
        </p>
      </template>
    </AppPageHeader>

    <p v-if="loading" role="status" class="mb-4 flex items-center gap-2 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading SealedSecret…
    </p>

    <!-- The detail is cleared before every load, so an empty result and a failed one are told
         apart rather than both reading as "not found". -->
    <template v-else>
      <AppAlert v-if="error" type="error" title="Could not load SealedSecret">
        <p class="m-0">{{ error }}</p>
        <AppButton class="mt-2" icon="refresh" @click="load">Retry</AppButton>
      </AppAlert>

      <AppEmpty v-else-if="!detail" icon="lock" description="SealedSecret not found" />

      <div v-else class="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_210px]">
        <div class="flex min-w-0 flex-col">
          <!-- Reported like a delivery, because it is the same result shape. -->
          <AppAlert v-if="syncOutcome" type="success" closable :title="syncTitle" class="mb-4" @close="syncOutcome = null">
            <span class="block">{{ syncSummary }}</span>
            <a
              v-if="syncOutcome?.proposal_url"
              :href="syncOutcome?.proposal_url"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-1 block break-all text-accent no-underline hover:underline"
            >{{ syncOutcome?.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
            <span v-if="!syncOutcome?.argocd_sync_verified" class="mt-1 block">ArgoCD synchronization is not verified by this workflow.</span>
          </AppAlert>
          <AppAlert v-if="syncError" type="error" closable class="mb-4" @close="syncError = ''">{{ syncError }}</AppAlert>

          <!-- Drift gates revealing and editing, so it is stated before the content it disables. -->
          <AppAlert v-if="driftStatus() !== 'in-sync'" type="warning" title="Git source is not confirmed in sync" class="mb-4">
            <p class="m-0">Status: {{ driftLabel }}. Reveal, editing, and delivery are disabled.</p>
            <!-- Git-only is the one drift nothing here can act on: this page never writes to
                 the cluster. -->
            <p v-if="driftStatus() === 'git_only'" class="mt-2 mb-0">
              The manifest is in Git and there is no Secret for it in the cluster. Nothing on this page writes to the
              cluster — a GitOps controller managing this namespace is what would apply it.
            </p>
            <!-- Git moved past the cluster, so a sync would overwrite a change this Secret
                 predates. Withheld rather than removed, and the sentence says what pressing it
                 would discard. -->
            <p v-if="canSync && syncBaseCommit && gitMovedAhead" class="mt-2 mb-0">
              Git holds a change this Secret predates: the mapped file was rewritten after the version in the
              cluster. Syncing would overwrite that change with this Secret's content.
            </p>
            <AppButton
              v-if="canSync && syncBaseCommit"
              :variant="gitMovedAhead ? 'secondary' : 'primary'"
              size="small"
              icon="git-branch"
              class="mt-2"
              :loading="syncing"
              @click="onSync"
            >{{ gitMovedAhead ? 'Sync anyway' : 'Sync Live Secret to Git' }}</AppButton>
            <p v-else class="mt-2 mb-0">{{ syncUnavailable }}</p>
          </AppAlert>

          <!-- The mode switch: real pressed buttons, so the state is announced and keyboard
               reachable, and selection is never colour alone. -->
          <div class="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Document mode">
            <button
              v-for="option in (['rows', 'yaml'] as const)"
              :key="option"
              type="button"
              class="cursor-pointer rounded-chip border px-2.5 py-1 text-xs font-semibold transition"
              :class="mode === option ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-ink'"
              :aria-pressed="mode === option"
              @click="setMode(option)"
            >{{ option === 'rows' ? 'Key rows' : 'YAML' }}</button>
            <span class="ml-auto text-sm text-muted">{{ countLabel(detail.key_count, 'encrypted key') }}</span>
          </div>

          <KeyRows v-if="mode === 'rows'" ref="editor" :detail="detail" @update:batch="batch = $event" />
          <DocumentEditor v-else :detail="detail" />

          <!-- What the review returned, and what the check verified. Both read from the store:
               the review is frozen at the moment it was made, so it keeps showing the ciphertext
               that was reviewed even after the rows move on. -->
          <section v-if="store.review" class="mt-6" aria-label="Reviewed ciphertext">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Review · includes {{ store.review.mutations.map((m) => `${m.operation} ${m.key}`).join(', ') }}
            </h2>
            <DiffBlocks :before="store.review.before" :after="store.review.after" />
          </section>

          <section v-if="store.check" class="mt-6" aria-label="Checked against the branch">
            <h2 class="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted">
              Check · {{ store.check.result.path }}
            </h2>
            <DiffBlocks
              :before="store.check.result.before"
              :after="store.check.result.after"
              before-label="Git before"
              :after-label="store.check.result.before ? 'Git after' : 'What will be written'"
            />
          </section>

          <AppAlert v-if="pressError" type="error" closable title="Operation failed" class="mt-4" @close="pressError = ''">{{ pressError }}</AppAlert>

          <AppAlert v-if="store.delivery" type="success" :title="deliveryHeading(store.delivery)" class="mt-4">
            <span class="block">{{ summarizeDelivery(store.delivery, { branch: detail.git.branch, file: store.check?.result.path || detail.git.file_path }) }}</span>
            <a
              v-if="store.delivery.proposal_url"
              :href="store.delivery.proposal_url"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-1 block break-all text-accent no-underline hover:underline"
            >{{ store.delivery.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
            <!-- False for every delivery: this workflow writes to Git and never watches the
                 cluster afterwards. -->
            <span v-if="!store.delivery.argocd_sync_verified" class="mt-1 block">ArgoCD synchronization is not verified by this workflow.</span>
          </AppAlert>

          <PendingBar
            :step="step"
            :mode="deliveryMode"
            :count="batch.length || (store.change?.mutations.length ?? 0)"
            :ready="ready"
            :busy="busy"
            :idle="idle"
            @press="press"
          />
        </div>

        <StateSpine :namespace="namespace()" :detail="detail" />
      </div>
    </template>
  </section>
</template>
