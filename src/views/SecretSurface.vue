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
// Which part of the two documents disagrees. Without it the only way to find out is to fetch the
// live resource and the file and diff them by hand, which is what this page exists to save.
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

// A press is offered only when there is a next one. A landed delivery is terminal: the bar is
// hidden entirely in that case (its confirmation carries what comes next), so the delivered state
// needs no sentence here.
const idle = computed(() => {
  // A batch staged before drift arrived keeps its button, disabled: the alert above is what says
  // why, and a sentence here would hide that anything is staged at all.
  const withheldByDrift = !inSync.value && !(step.value === 'review' && batch.value.length > 0)
  if (withheldByDrift) return 'Reveal and editing are disabled while this Secret differs from Git.'
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

// Composing is the editing stage: no review, check, or delivery on screen. The document shows only
// here; once a diff or confirmation is up, that one block is the task instead.
const composing = computed(() => !store.review && !store.check && !store.delivery)

// The four stops this flow passes through. Edit is home base, and the only stop with a way back — the
// press bar carries the next press and nothing else — and it is a back target only while the delivery
// has not landed. The rail shows only while the Secret is editable; drift takes the screen otherwise,
// and a review can only have landed while the Secret was in sync, so the stop is on screen whenever it
// is needed.
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

// Each press opens its result below the editor; the viewport is carried to it so the operator is
// not left scrolling past the key rows to find what the press produced. One diff shows at a time
// (the review folds away when the check lands), so each watcher reveals the panel now on screen.
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

// Editing a row after a review was taken makes that review stale — it diffed a batch the rows no
// longer match — so the review and check are dropped and the workflow returns to its first step,
// reflecting the new edits. Skipped while a delivery is on screen: that batch-clear is the delivery
// landing, not an edit, and its success must not be wiped. `startOver` below asks for the same move
// deliberately, from the rail.
watch(batch, () => {
  if ((store.review || store.check) && !store.delivery) store.discardReview()
})

// The rail's Edit stop, from a review or a check: drop the derived steps and return to editing the
// rows, which are still holding the staged change. It is the same move the row edit above makes
// automatically, asked for deliberately rather than by touching a row.
function startOver() { store.discardReview() }

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
// Identity drift is the one divergence a sync cannot resolve: the mapped file is another Secret's
// manifest, so the server refuses the sync as PATH_OCCUPIED. Withhold the control rather than offer a
// button that only ever returns a conflict.
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
    // The dialog unmounts with the pressed button inside it, so focus is carried to the alert the
    // press produced rather than left on `<body>`; the opener is the fallback when there is none.
    const fallback = confirmReturn
    confirmReturn = null
    confirming.value = false
    void revealRegion(() => syncOutcomeAlert.value?.$el ?? syncErrorAlert.value?.$el ?? fallback, { focus: true })
  }
}

// A sync overwrites the mapped file, so it is confirmed first, and the dialog carries both
// documents: the file as Git holds it and the cluster's manifest that would replace it.
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

    <p v-if="loading" role="status" class="flex items-center gap-2 page-x pt-4 text-sm text-muted">
      <AppSpinner :size="15" />
      Loading SealedSecret…
    </p>

    <!-- The detail is cleared before every load, so an empty result and a failed one are told
         apart rather than both reading as "not found". -->
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
          <!-- Where you are in the workflow, pinned above the editor. It shows only while the
               Secret is editable; when the Git source has drifted the alert below takes the screen
               and there is no workflow to be partway through. -->
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

          <!-- Drift gates revealing and editing, so it is stated before the content it disables.
               Three facts only: which state, what differs, and the one control that can act. The
               consequence of pressing it is the dialog's, where both documents are on screen. -->
          <AppAlert v-if="!inSync" type="error" :title="`Not in sync: ${driftLabel}`" class="mb-5">
            <!-- What differs, named here rather than left to a manual diff of the live resource
                 against the file. The paths are set with the sentence they explain, apart from the
                 paragraphs below, because they are one answer rather than two. -->
            <p v-if="driftReason" class="m-0 max-w-[62ch] text-[13px] text-muted">{{ driftReason }}</p>
            <p v-if="driftFields" class="mt-[3px] mb-0 max-w-[62ch] break-words font-mono text-xs text-muted">{{ driftFields }}</p>
            <!-- Git-only is the one drift nothing here can act on: this page never writes to
                 the cluster. -->
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

          <!-- The document region. It is hidden while a diff is under review or the change has
               landed, so that one block — the diff, or the confirmation — is the task rather than a
               panel stacked below the whole key list. Both editors stay mounted (v-show, never
               v-if) so a staged batch survives the trip through review and back via the rail. -->
          <div v-show="composing">
            <!-- The mode switch: pressed buttons, so the state is announced, keyboard reachable,
                 and never colour alone. -->
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

          <!-- What the review returned, and what the check verified. Both read from the store:
               the review is frozen at the moment it was made, so it keeps showing the ciphertext
               that was reviewed even after the rows move on. Each folds open where it lands, so
               the presses below it move down rather than jumping. The fold's child stays mounted
               only while the panel is; a result that has been spent leaves at once. -->
          <!-- One diff at a time. The review's predicted ciphertext and the check's dry-run against
               the branch are near-identical YAML, so showing both stacks two walls of text that
               say almost the same thing; once the check lands it supersedes the review, so the
               review folds away and the check takes its place. Because only one is ever open, the
               open one carries the way back: an Edit in its heading, the same control — and the
               same accent — as the create form's folded row.
               The heading is keylined like that row too. The two stages are the same moment in the
               same product, and the create flow puts its bar around the line bearing Edit rather
               than leaving it as prose; a heading here would be the one place the way back is not
               dressed the way the other flow dresses it. This is not the create bar's content —
               that bar names the Secret, and the page header above already does here — only its
               shape. Each is rendered only while its own fold is open, because a shut fold keeps
               its children mounted and a tab stop on a panel nobody can see is a trap. -->
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
                <!-- False for every delivery: this workflow writes to Git and never watches the
                     cluster afterwards. -->
                <p v-if="!store.delivery.argocd_sync_verified" class="mt-[3px] mb-0 border-t border-border pt-[9px] text-xs text-muted">
                  A GitOps controller has not confirmed this reached the cluster.
                </p>
                <!-- The next step rides with the confirmation rather than a spent workflow bar.
                     Editing again reloads the Secret so the next change is staged against the commit
                     this delivery just made, not the stale one it started from. -->
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

    <!-- The two documents travel with the confirmation: "overwrite" is not a fact the operator can
         check from the page that offers it. -->
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
