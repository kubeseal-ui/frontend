<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppEmpty from '@/components/ui/AppEmpty.vue'
import AppIcon from '@/components/ui/AppIcon.vue'
import type { Fact } from '@/components/ui/AppPageFacts.vue'
import AppPageHeader from '@/components/ui/AppPageHeader.vue'
import AppSpinner from '@/components/ui/AppSpinner.vue'
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

const inSync = computed(() => driftStatus() === 'in-sync')
const canReveal = computed(() => inSync.value && scoped('secret:decrypt'))

const facts = computed<Fact[]>(() => {
  if (!detail.value) return []
  return [
    { value: detail.value.scope || 'strict', label: 'scope' },
    { value: String(detail.value.key_count), label: 'encrypted keys' },
    inSync.value
      ? { label: 'in sync', tone: 'success' }
      : { label: driftLabel.value.toLowerCase(), tone: 'danger' },
  ]
})

// Where a change here lands, and how it gets there: the file, the branch, the mode.
const destination = computed(() =>
  [detail.value?.git.repository ?? '', detail.value?.git.branch ?? ''].filter(Boolean).join(' @ '))

const staged = computed(() => batch.value.length || (store.change?.mutations.length ?? 0))

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
  if (!inSync.value) return 'Reveal and editing are disabled while the Git source is not confirmed in sync.'
  if (step.value === 'review' && batch.value.length === 0) {
    // "Change, remove, or add a key" is only true when this page is offering those controls. Over
    // a Secret whose grants have withheld all three, it sends the operator looking for a button
    // that is not there, so that reason gets its own sentence instead.
    if (!scoped('secret:seal') || !scoped('secret:decrypt')) {
      return 'Staging a change needs the secret:seal and secret:decrypt capabilities in this namespace.'
    }
    if (baseCommit.value === '') {
      return 'The Git source reported no base commit, so there is nothing to stage a change against.'
    }
    return 'Nothing staged. Reveal, change, or remove a key to begin.'
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
  <section aria-labelledby="page-title">
    <AppPageHeader :title="title" title-id="page-title" :facts="facts">
      <template #back>
        <RouterLink
          :to="`/namespaces/${encodeURIComponent(namespace())}`"
          class="inline-flex items-center gap-1.5 text-[12.5px] text-muted no-underline hover:text-ink"
        >
          <AppIcon name="chevron-left" :size="12" />
          {{ namespace() }}
        </RouterLink>
      </template>

      <template v-if="detail" #context><span v-if="detail.git.file_path">{{ detail.git.file_path }} · </span><span v-if="destination" class="font-mono text-muted">{{ destination }}</span><template v-if="destination"> · </template>{{ deliveryMode }}</template>
    </AppPageHeader>

    <p v-if="loading" role="status" class="flex items-center gap-2 px-[26px] pt-4 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading SealedSecret…
    </p>

    <!-- The detail is cleared before every load, so an empty result and a failed one are told
         apart rather than both reading as "not found". -->
    <template v-else>
      <div class="px-[26px]">
        <AppAlert v-if="error" type="error" title="Could not load SealedSecret">
          <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ error }}</p>
          <AppButton class="mt-1 self-start" icon="refresh" @click="load">Retry</AppButton>
        </AppAlert>

        <AppEmpty v-else-if="!detail" icon="lock" description="SealedSecret not found" />
      </div>

      <div v-if="detail" class="flex items-start gap-7 px-[26px] pb-10">
        <div class="min-w-0 flex-1">
          <!-- Reported like a delivery, because it is the same result shape. -->
          <AppAlert v-if="syncOutcome" type="success" :title="syncTitle" class="mb-5">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ syncSummary }}</p>
            <a
              v-if="syncOutcome?.proposal_url"
              :href="syncOutcome?.proposal_url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono text-xs break-all text-accent no-underline hover:underline"
            >{{ syncOutcome?.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
            <p v-if="!syncOutcome?.argocd_sync_verified" class="mt-[3px] mb-0 border-t border-border pt-[9px] text-xs text-faint">
              ArgoCD synchronization is not verified by this workflow.
            </p>
          </AppAlert>

          <AppAlert v-if="syncError" type="error" title="The live Secret could not be synced to Git" class="mb-[3px]">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ syncError }}</p>
          </AppAlert>

          <!-- Drift gates revealing and editing, so it is stated before the content it disables. -->
          <AppAlert v-if="!inSync" type="error" title="Git source is not confirmed in sync" class="mb-5">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">
              Status: <strong class="font-semibold text-ink">{{ driftLabel }}</strong>. Reveal, editing, and delivery are disabled.
            </p>
            <!-- Git-only is the one drift nothing here can act on: this page never writes to
                 the cluster. -->
            <p v-if="driftStatus() === 'git_only'" class="m-0 max-w-[62ch] text-[13px] text-muted">
              The manifest is in Git and there is no Secret for it in the cluster. Nothing on this page writes to the
              cluster — a GitOps controller managing this namespace is what would apply it.
            </p>
            <!-- Git moved past the cluster, so a sync would overwrite a change this Secret
                 predates. Withheld rather than removed, and the sentence says what pressing it
                 would discard. -->
            <p v-if="canSync && syncBaseCommit && gitMovedAhead" class="m-0 max-w-[62ch] text-[13px] text-muted">
              Git holds a change this Secret predates: the mapped file was rewritten after the version in the
              cluster. Syncing would overwrite that change with this Secret's content.
            </p>
            <div v-if="canSync && syncBaseCommit" class="mt-1 flex items-center gap-2.5">
              <AppButton
                :variant="gitMovedAhead ? 'secondary' : 'primary'"
                icon="file"
                :loading="syncing"
                @click="onSync"
              >{{ gitMovedAhead ? 'Sync anyway' : 'Sync Live Secret to Git' }}</AppButton>
              <span class="text-xs text-faint">writes what is in the cluster to the mapped file</span>
            </div>
            <p v-else class="m-0 max-w-[62ch] text-[13px] text-muted">{{ syncUnavailable }}</p>
            <p class="mt-[3px] mb-0 border-t border-border pt-[9px] text-xs text-faint">
              ArgoCD synchronization is not verified by this workflow.
            </p>
          </AppAlert>

          <!-- The mode switch: pressed buttons, so the state is announced, keyboard reachable,
               and never colour alone. -->
          <div class="flex items-center gap-2 border-b border-border pb-3" role="group" aria-label="Document mode">
            <span class="flex gap-[3px] rounded-control border border-border bg-surface p-[3px]">
              <button
                v-for="option in (['rows', 'yaml'] as const)"
                :key="option"
                type="button"
                class="h-[26px] cursor-pointer rounded-chip border-0 bg-transparent px-3 text-[12.5px] font-semibold"
                :class="mode === option ? 'bg-surface-raised text-accent' : 'text-muted hover:text-ink'"
                :aria-pressed="mode === option"
                @click="setMode(option)"
              >{{ option === 'rows' ? 'Keys' : 'YAML' }}</button>
            </span>
            <span v-if="staged" class="ml-auto font-mono text-xs text-faint">{{ countLabel(staged, 'change') }} staged</span>
            <span v-else-if="!inSync" class="ml-auto font-mono text-xs text-faint">read only</span>
          </div>

          <KeyRows v-if="mode === 'rows'" ref="editor" :detail="detail" @update:batch="batch = $event" />
          <DocumentEditor v-else :detail="detail" />

          <!-- What the review returned, and what the check verified. Both read from the store:
               the review is frozen at the moment it was made, so it keeps showing the ciphertext
               that was reviewed even after the rows move on. -->
          <template v-if="store.review">
            <h3 class="mt-[26px] mb-[9px] text-xs font-[650] text-muted">
              Review · <code v-for="(m, i) in store.review.mutations" :key="m.key" class="font-mono font-medium text-ink">{{ i ? ', ' : '' }}{{ m.operation }} {{ m.key }}</code>
            </h3>
            <DiffBlocks :before="store.review.before" :after="store.review.after" />
          </template>

          <template v-if="store.check">
            <h3 class="mt-[26px] mb-[9px] text-xs font-[650] text-muted">
              Check · <code class="font-mono font-medium text-ink">{{ store.check.result.path }}</code>
            </h3>
            <DiffBlocks :before="store.check.result.before" :after="store.check.result.after" />
          </template>

          <AppAlert v-if="pressError" type="error" title="Operation failed" class="mt-4">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ pressError }}</p>
          </AppAlert>

          <AppAlert v-if="store.delivery" type="success" :title="deliveryHeading(store.delivery)" class="mt-4">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ summarizeDelivery(store.delivery, { branch: detail.git.branch, file: store.check?.result.path || detail.git.file_path }) }}</p>
            <a
              v-if="store.delivery.proposal_url"
              :href="store.delivery.proposal_url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono text-xs break-all text-accent no-underline hover:underline"
            >{{ store.delivery.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
            <!-- False for every delivery: this workflow writes to Git and never watches the
                 cluster afterwards. -->
            <p v-if="!store.delivery.argocd_sync_verified" class="mt-[3px] mb-0 border-t border-border pt-[9px] text-xs text-faint">
              ArgoCD synchronization is not verified by this workflow.
            </p>
          </AppAlert>

          <PendingBar
            :step="step"
            :mode="deliveryMode"
            :count="staged"
            :ready="ready"
            :busy="busy"
            :idle="idle"
            @press="press"
          />
        </div>

        <StateSpine
          :detail="detail"
          :staged="staged"
          :base-commit="baseCommit"
          :can-seal="canPatch"
          :can-reveal="canReveal"
          :can-deliver="canDeliver"
          :can-sync="Boolean(canSync && syncBaseCommit && !inSync)"
        />
      </div>
    </template>
  </section>
</template>
