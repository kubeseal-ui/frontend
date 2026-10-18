<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
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
import ProgressRail from '@/components/ProgressRail.vue'
import StateSpine from '@/components/StateSpine.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { deliveryHeading, requiredDeliveryCapability, summarizeDelivery } from '@/utils/delivery'
import { driftFieldList, driftPresentation, driftReasonSentence } from '@/utils/drift'
import { revealRegion } from '@/utils/reveal'
import { countLabel } from '@/utils/format'
import type { DeliveryResult, Mutation, WorkflowStep } from '@/types'

// One screen per Secret: the document is always editable, and the three presses all come from the one button at its foot.
const route = useRoute(); const auth = useAuthStore(); const store = useSecretsStore(); const router = useRouter()
const loading = ref(true); const error = ref('')
const pressError = ref(''); const busy = ref(false)

/** The rows the editor is holding; only the first press reads it, so it is not mirrored into the store on every keystroke. */
const batch = ref<Mutation[]>([])
const editor = ref<InstanceType<typeof KeyRows> | null>(null)

const namespace = () => String(route.params.namespace)
const name = () => String(route.params.name)
const detail = computed(() => store.currentDetail)

// A mode switch, not a route: the URL carries it so a reload lands here, but moving between modes must not refetch the Secret.
const mode = computed<'rows' | 'yaml'>(() => (route.query.mode === 'yaml' ? 'yaml' : 'rows'))
function setMode(next: 'rows' | 'yaml') {
  router.replace({ query: { ...route.query, mode: next } })
}

const scoped = (capability: 'secret:seal' | 'secret:decrypt' | 'gitops:push' | 'gitops:propose') =>
  auth.hasCapability(namespace(), capability)
const canPatch = computed(() => Boolean(detail.value?.git.in_sync_with_live) && scoped('secret:seal'))
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
// Which part of the two documents disagrees; without it the only way to find out is to diff them by hand, which this page exists to save.
const driftReason = computed(() => driftReasonSentence(detail.value?.git.drift_reason))
const driftFields = computed(() => driftFieldList(detail.value?.git.drift_fields))

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

// The three presses
const step = computed<WorkflowStep>(() => {
  if (!store.review) return 'review'
  if (!store.check) return 'apply-check'
  return 'deliver'
})

// Withheld when the batch is empty, by capability, and by drift; any other refusal is answered by the server rather than a dead button explaining itself.
const ready = computed(() => {
  if (step.value === 'review') return batch.value.length > 0 && canPatch.value && baseCommit.value !== ''
  if (step.value === 'deliver') return canDeliver.value
  return true
})

// A press is offered only when there is a next one; a landed delivery is terminal and shows its confirmation instead.
const idle = computed(() => {
  // A batch staged before drift arrived keeps its button, disabled, because the alert above says why.
  const withheldByDrift = !inSync.value && !(step.value === 'review' && batch.value.length > 0)
  if (withheldByDrift) return 'Reveal and editing are disabled while this Secret differs from Git.'
  if (step.value === 'review' && batch.value.length === 0) {
    // That instruction is only true when this page offers those controls, so withheld grants get their own sentence rather than a hunt for a missing button.
    if (!scoped('secret:seal')) {
      return 'Staging a change needs the secret:seal capability in this namespace.'
    }
    if (baseCommit.value === '') {
      return 'The Git source reported no base commit, so there is nothing to stage a change against.'
    }
    return 'Nothing staged. Reveal, change, or remove a key to begin.'
  }
  return ''
})

// Composing is the editing stage: once a diff or confirmation is up, that one block is the task instead.
const composing = computed(() => !store.review && !store.check && !store.delivery)

// The four stops; Edit is the only one with a way back, and only while the delivery has not landed. Drift takes the screen instead of the rail.
const railSteps = computed(() => [
  { key: 'edit', label: 'Edit', back: !store.delivery },
  { key: 'review', label: 'Review' },
  { key: 'check', label: 'Check' },
  { key: 'deliver', label: 'Deliver' },
])
const activeStep = computed(() => (store.delivery ? 3 : store.check ? 2 : store.review ? 1 : 0))
function onRailNavigate(key: string) {
  if (key === 'edit' && !store.delivery) startOver()
}

// Each press opens its result below the editor and the viewport is carried to it; one diff shows at a time, so each watcher reveals the panel now on screen.
const reviewFold = ref<HTMLElement | null>(null)
const checkFold = ref<HTMLElement | null>(null)
const deliveryAlert = ref<{ $el?: HTMLElement } | null>(null)
const pressErrorAlert = ref<{ $el?: HTMLElement } | null>(null)
const syncOutcomeAlert = ref<{ $el?: HTMLElement } | null>(null)
const syncErrorAlert = ref<{ $el?: HTMLElement } | null>(null)
watch(() => Boolean(store.review) && !store.check, (open) => { if (open) revealRegion(() => reviewFold.value) })
watch(() => Boolean(store.check), (open) => { if (open) revealRegion(() => checkFold.value) })
watch(() => store.delivery, (delivered) => { if (delivered) revealRegion(() => deliveryAlert.value?.$el, { focus: true }) })
// A refused press lands below the diff; carry it into view and focus it so it is never silent.
watch(pressError, (next) => { if (next) revealRegion(() => pressErrorAlert.value?.$el, { focus: true }) })

async function press() {
  if (!ready.value) return
  pressError.value = ''
  // An incomplete batch is the operator asking what is missing, so every row answers at once and nothing is sent.
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

// A delivery consumes the staged set: leaving those rows standing would show a change that has already landed.
watch(() => store.delivery, (outcome) => { if (outcome) { editor.value?.clear(); batch.value = [] } })

// Editing after a review makes that review stale, so it is dropped; skipped while a delivery is on screen, because that clear is the delivery landing, not an edit.
watch(batch, () => {
  if ((store.review || store.check) && !store.delivery) store.discardReview()
})

// The rail's Edit stop: the same move the row edit above makes automatically, asked for deliberately.
function startOver() { store.discardReview() }

// Sync
const syncError = ref('')
const syncOutcome = ref<DeliveryResult | null>(null)
const syncing = ref(false)
// The endpoint refuses an empty base commit, so an absent value withholds the control; the server reports a head even for a live-only Secret.
const syncBaseCommit = computed(() => detail.value?.git.base_commit || '')
// The Git file moved on since the live Secret's version, so a sync would overwrite whatever replaced it.
const gitMovedAhead = computed(() => Boolean(detail.value?.git.git_moved_ahead))
// Identity drift is the one divergence a sync cannot resolve — the mapped file belongs to another Secret, refused as PATH_OCCUPIED — so the control is withheld.
const identityDrift = computed(() => detail.value?.git.drift_reason === 'identity')
const canSync = computed(() => {
  if (identityDrift.value) return false
  const required = requiredDeliveryCapability(detail.value?.git.delivery_mode || '')
  return required ? auth.hasCapability(namespace(), required) : false
})

// Four situations, four answers: identity drift, no Git policy, no branch head, no capability.
const syncUnavailable = computed(() => {
  const mode = detail.value?.git.delivery_mode
  if (identityDrift.value) return 'The mapped file in Git holds a different Secret, so syncing this one would overwrite it. Point the namespace mapping at the right path, or move the other manifest, before syncing.'
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
  } finally {
    syncing.value = false
    // The dialog unmounts with the pressed button inside it, so focus is carried to the alert the press produced; the opener is the fallback.
    const fallback = confirmReturn
    confirmReturn = null
    confirming.value = false
    void revealRegion(() => syncOutcomeAlert.value?.$el ?? syncErrorAlert.value?.$el ?? fallback, { focus: true })
  }
}

// A sync overwrites the mapped file, so it is confirmed first, with the Git copy and the replacing manifest side by side.
const confirming = ref(false)
const confirmOverlay = ref<HTMLElement | null>(null)
let confirmReturn: HTMLElement | null = null
const confirmManifest = computed(() => detail.value?.sealed_secret_yaml || '')
const confirmGitCopy = computed(() => detail.value?.git.git_file_yaml || '')
const confirmWhere = computed(() => {
  const file = detail.value?.git.file_path || ''
  const branch = detail.value?.git.branch || ''
  return branch && file ? `${file} on ${branch}` : file || 'the mapped file'
})

async function openSyncConfirm() {
  confirmReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null
  confirming.value = true
  await nextTick()
  confirmOverlay.value?.querySelector<HTMLElement>('button')?.focus()
}
function closeSyncConfirm() {
  confirming.value = false
  confirmReturn?.focus()
  confirmReturn = null
}
function trapConfirmTab(event: KeyboardEvent) {
  if (event.key !== 'Tab' || !confirmOverlay.value) return
  const focusable = Array.from(confirmOverlay.value.querySelectorAll<HTMLElement>('button'))
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
// A route change unmounts this view without the watcher firing again, so the lock is released here.
watch(confirming, (open) => { document.body.style.overflow = open ? 'hidden' : '' })
onUnmounted(() => { document.body.style.overflow = '' })

// Load
async function load() {
  loading.value = true; error.value = ''
  // A route change reuses this instance, so a stale report would render above the next Secret and a stale change would be applied to it.
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
// Two sources, not a getter returning an array: a fresh array never compares equal, so that form would reload on the `?mode=` flip.
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

    <p v-if="loading" role="status" class="flex items-center gap-2 page-x pt-4 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading SealedSecret…
    </p>

    <!-- The detail is cleared before every load, so an empty result and a failed one are told apart rather than both reading as "not found". -->
    <template v-else>
      <div class="page-x">
        <AppAlert v-if="error" type="error" title="Could not load SealedSecret">
          <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ error }}</p>
          <AppButton class="mt-1 self-start" icon="refresh" @click="load">Retry</AppButton>
        </AppAlert>

        <AppEmpty v-else-if="!detail" icon="lock" description="SealedSecret not found" />
      </div>

      <!-- Spine stacks under the document on a phone and sits beside it from 820px. -->
      <div v-if="detail" class="flex min-[820px]:flex-row flex-col items-start max-sm:items-stretch gap-7 page-x pb-10">
        <div class="min-w-0 flex-1">
          <!-- Pinned above the editor, shown only while the Secret is editable; drift takes the screen instead. -->
          <div v-if="inSync" class="sticky top-[59px] max-sm:top-[105px] z-10 mb-4 bg-bg py-1">
            <ProgressRail :steps="railSteps" :active="activeStep" @navigate="onRailNavigate" />
          </div>

          <!-- Reported like a delivery, because it is the same result shape. -->
          <AppAlert v-if="syncOutcome" ref="syncOutcomeAlert" type="success" :title="syncTitle" class="mb-5">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ syncSummary }}</p>
            <a
              v-if="syncOutcome?.proposal_url"
              :href="syncOutcome?.proposal_url"
              target="_blank"
              rel="noopener noreferrer"
              class="font-mono text-xs break-all text-accent no-underline hover:underline"
            >{{ syncOutcome?.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
            <p v-if="!syncOutcome?.argocd_sync_verified" class="mt-[3px] mb-0 border-t border-border pt-[9px] text-xs text-muted">
              A GitOps controller has not confirmed this reached the cluster.
            </p>
          </AppAlert>

          <AppAlert v-if="syncError" ref="syncErrorAlert" type="error" title="The live Secret could not be synced to Git" class="mb-[3px]">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ syncError }}</p>
          </AppAlert>

          <!-- Drift gates revealing and editing, so it is stated before the content it disables. -->
          <AppAlert v-if="!inSync" type="error" :title="`Not in sync: ${driftLabel}`" class="mb-5">
            <!-- What differs, named here rather than left to a manual diff of the live resource against the file. -->
            <p v-if="driftReason" class="m-0 max-w-[62ch] text-[13px] text-muted">{{ driftReason }}</p>
            <p v-if="driftFields" class="mt-[3px] mb-0 max-w-[62ch] break-words font-mono text-xs text-muted">{{ driftFields }}</p>
            <!-- Git-only is the one drift nothing here can act on: this page never writes to the cluster. -->
            <p v-if="driftStatus() === 'git_only'" class="m-0 max-w-[62ch] text-[13px] text-muted">
              The manifest is in Git and there is no Secret for it in the cluster. Nothing on this page writes to the
              cluster — a GitOps controller managing this namespace is what would apply it.
            </p>
            <div v-if="canSync && syncBaseCommit" class="mt-1 flex items-center gap-2.5">
              <AppButton
                :variant="gitMovedAhead ? 'secondary' : 'primary'"
                icon="file"
                :loading="syncing"
                @click="openSyncConfirm"
              >{{ gitMovedAhead ? 'Sync anyway' : 'Sync Live Secret to Git' }}</AppButton>
            </div>
            <p v-else class="m-0 max-w-[62ch] text-[13px] text-muted">{{ syncUnavailable }}</p>
          </AppAlert>

          <!-- Hidden while a diff or confirmation is the task; both editors stay mounted (v-show) so a staged batch survives review and back. -->
          <div v-show="composing">
            <!-- Pressed buttons, so the state is announced and never colour alone. -->
            <div class="flex items-center gap-2 border-b border-border pb-3" role="group" aria-label="Document mode">
              <span class="flex max-sm:gap-2 gap-[3px] rounded-control border border-border bg-surface p-[3px]">
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

            <KeyRows v-show="mode === 'rows'" ref="editor" :detail="detail" @update:batch="batch = $event" />
            <DocumentEditor v-show="mode === 'yaml'" :detail="detail" />
          </div>

          <!-- One diff at a time: the check supersedes the near-identical review, and the open fold's Edit heading is the way back, keylined like the create form's folded row. Each child renders only while open, because a tab stop on a hidden panel is a trap. -->
          <div class="fold" ref="reviewFold" :class="{ open: Boolean(store.review) && !store.check }">
            <div>
              <template v-if="store.review">
                <h3 class="mt-[26px] mb-4 flex flex-wrap items-center gap-2.5 rounded-control border border-border bg-surface px-3 py-[9px] text-xs font-[650] text-muted">
                  <span class="min-w-0">Review · <code v-for="(m, i) in store.review.mutations" :key="m.key" class="font-mono font-medium text-ink">{{ i ? ', ' : '' }}{{ m.operation }} {{ m.key }}</code></span>
                  <button
                    v-if="!store.check"
                    type="button"
                    class="ml-auto shrink-0 cursor-pointer font-semibold text-accent hover:underline underline-offset-4"
                    aria-label="Edit values"
                    @click="startOver"
                  >Edit</button>
                </h3>
                <DiffBlocks :before="store.review.before" :after="store.review.after" />
              </template>
            </div>
          </div>

          <div class="fold" ref="checkFold" :class="{ open: Boolean(store.check) && !store.delivery }">
            <div>
              <template v-if="store.check">
                <h3 class="mt-[26px] mb-4 flex flex-wrap items-center gap-2.5 rounded-control border border-border bg-surface px-3 py-[9px] text-xs font-[650] text-muted">
                  <span class="min-w-0">Check · <code class="font-mono font-medium text-ink">{{ store.check.result.path }}</code></span>
                  <button
                    v-if="!store.delivery"
                    type="button"
                    class="ml-auto shrink-0 cursor-pointer font-semibold text-accent hover:underline underline-offset-4"
                    aria-label="Edit values"
                    @click="startOver"
                  >Edit</button>
                </h3>
                <DiffBlocks :before="store.check.result.before" :after="store.check.result.after" />
              </template>
            </div>
          </div>

          <AppAlert v-if="pressError" ref="pressErrorAlert" type="error" title="Operation failed" class="mt-4">
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ pressError }}</p>
          </AppAlert>

          <div class="fold" :class="{ open: Boolean(store.delivery) }">
            <div>
              <AppAlert v-if="store.delivery" ref="deliveryAlert" type="success" :title="deliveryHeading(store.delivery)" class="mt-4">
                <p class="m-0 max-w-[62ch] text-[13px] text-muted">{{ summarizeDelivery(store.delivery, { branch: detail.git.branch, file: store.check?.result.path || detail.git.file_path }) }}</p>
                <a
                  v-if="store.delivery.proposal_url"
                  :href="store.delivery.proposal_url"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-mono text-xs break-all text-accent no-underline hover:underline"
                >{{ store.delivery.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
                <!-- False for every delivery: this workflow writes to Git and never watches the cluster afterwards. -->
                <p v-if="!store.delivery.argocd_sync_verified" class="mt-[3px] mb-0 border-t border-border pt-[9px] text-xs text-muted">
                  A GitOps controller has not confirmed this reached the cluster.
                </p>
                <!-- Editing again reloads the Secret so the next change is staged against the commit this delivery just made. -->
                <AppButton class="mt-2.5 self-start" icon="pencil" @click="load">Edit this Secret again</AppButton>
              </AppAlert>
            </div>
          </div>

          <PendingBar
            v-if="!store.delivery"
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

    <!-- The two documents travel with the confirmation: "overwrite" is not a fact the operator can check from the page that offers it. -->
    <Teleport to="body">
      <div
        v-if="confirming"
        ref="confirmOverlay"
        role="dialog"
        aria-modal="true"
        aria-label="Confirm syncing the live Secret to Git"
        class="glass-scrim fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
        @keydown.esc.prevent="closeSyncConfirm"
        @keydown="trapConfirmTab"
      >
        <div class="glass-panel flex max-h-full w-full max-w-4xl flex-col gap-3 rounded-card p-4 sm:p-5">
          <div class="flex flex-col gap-1">
            <h2 class="m-0 text-[15px] font-semibold text-ink">
              {{ gitMovedAhead ? 'Overwrite the newer Git copy?' : 'Sync this Secret to Git?' }}
            </h2>
            <p class="m-0 max-w-[62ch] text-[13px] text-muted">
              Writing to <span class="font-mono text-ink">{{ confirmWhere }}</span> replaces it with the
              manifest below.
              <template v-if="gitMovedAhead">Git's version is not in the right column. It will be gone.</template>
            </p>
          </div>

          <div class="min-h-0 flex-1 overflow-auto">
            <DiffBlocks
              :before="confirmGitCopy"
              :after="confirmManifest"
              before-label="In Git now"
              after-label="From the cluster: what gets written"
            />
          </div>

          <div class="flex items-center justify-end gap-2">
            <AppButton variant="ghost" @click="closeSyncConfirm">Cancel</AppButton>
            <AppButton
              :variant="gitMovedAhead ? 'secondary' : 'primary'"
              :loading="syncing"
              @click="onSync"
            >{{ gitMovedAhead ? 'Sync anyway' : 'Sync Live Secret to Git' }}</AppButton>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>
