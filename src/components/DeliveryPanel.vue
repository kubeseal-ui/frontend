<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppCode from '@/components/ui/AppCode.vue'
import StageRow from '@/components/ui/StageRow.vue'
import { describeError } from '@/api'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import { deliveryHeading, requiredDeliveryCapability, summarizeDelivery } from '@/utils/delivery'
import type { DeliveryResult, SealedSecretDetail } from '@/types'

// Absent on the create page, where the namespace comes from the new-secret draft.
const props = defineProps<{ detail?: SealedSecretDetail }>()
const auth = useAuthStore(); const store = useSecretsStore()
const loading = ref(false); const applying = ref(false); const error = ref(''); const result = ref('')

const namespace = computed(() => store.newSecretDraft?.namespace || props.detail?.namespace || '')
const mode = computed(() => props.detail?.git.delivery_mode || store.namespaceDeliveryMode(namespace.value))
// The same rule the detail page's sync control uses, so the two cannot disagree.
const canDeliver = computed(() => {
  const required = requiredDeliveryCapability(mode.value)
  return required ? auth.hasCapability(namespace.value, required) : false
})
const actionLabel = computed(() => mode.value === 'direct' ? 'Deliver directly' : 'Create proposal')
const hasReview = computed(() => Boolean(store.currentDiff || store.newSecretDraft || store.dryRunResult))
// Two-tier discovery reads a Secret in an application subdirectory out of the tree walk,
// not from the mapping's templated path, so an edit delivered without the reviewed
// `target_path` would land at the template and leave a second file claiming the same
// identity. The server resolves the destination itself and refuses a name that is not
// where the Secret already lives.
const target = computed(() => store.newSecretDraft
  ? { namespace: store.newSecretDraft.namespace, name: store.newSecretDraft.name, base_commit: store.newSecretDraft.base_commit, target_path: store.newSecretDraft.target_path }
  : { namespace: namespace.value, name: props.detail?.name || '', base_commit: store.currentDiff?.base_commit || props.detail?.git.base_commit || '', target_path: store.currentDiff?.target_path || props.detail?.git.file_path })

const resolvedPaths = computed(() => store.namespaceGitPaths(namespace.value))
const destination = computed(() => {
  const parts: string[] = []
  if (resolvedPaths.value?.repository) parts.push(`repository ${resolvedPaths.value.repository}`)
  if (resolvedPaths.value?.branch) parts.push(`branch ${resolvedPaths.value.branch}`)
  const file = target.value.target_path || store.dryRunResult?.path
  if (file) parts.push(`file ${file}`)
  if (mode.value) parts.push(`${mode.value} delivery`)
  return parts.join(', ')
})

const reviewedYaml = computed(() => store.dryRunResult?.after || store.currentDiff?.after || store.newSecretDraft?.yaml || '')
// The server echoes keys and operations, never values.
const reviewedKeys = computed(() => store.currentDiff?.mutations?.map((mutation) => `${mutation.operation} ${mutation.key}`).join(', ') || '')
// Both GitOps endpoints reject an empty base commit, so the controls are withheld
// rather than offered and then refused with a 400.
const hasBaseCommit = computed(() => Boolean(target.value.base_commit))
// A delivery clears the diff or draft this panel reads, so the controls stand down until
// the next review instead of reporting "nothing to deliver against" after a success.
const delivered = ref(false)
const deliveryOutcome = ref<DeliveryResult | null>(null)
// Frozen at delivery, because the clears below are what these were read from.
const deliveryContext = ref<{ branch: string; file: string; destination: string } | null>(null)
const deliveryTitle = computed(() => deliveryOutcome.value ? deliveryHeading(deliveryOutcome.value) : '')
const deliverySummary = computed(() => deliveryOutcome.value
  ? summarizeDelivery(deliveryOutcome.value, {
      branch: deliveryContext.value?.branch || resolvedPaths.value?.branch,
      file: deliveryContext.value?.file || store.dryRunResult?.path || target.value.target_path,
    })
  : '')
const shownDestination = computed(() => deliveryContext.value?.destination || destination.value)
const shortBase = computed(() => store.dryRunResult?.base_commit.slice(0, 7) || '')
const canDeliverNow = computed(() => canDeliver.value && hasBaseCommit.value && !delivered.value)
// Only a transition into a review re-arms; a delivery clears these same fields.
watch([() => store.currentDiff, () => store.newSecretDraft], ([diff, draft]) => {
  if (diff || draft) {
    delivered.value = false
    deliveryOutcome.value = null
    deliveryContext.value = null
  }
})
const stage = computed<'review' | 'apply' | 'dry-run' | 'deliver'>(() => {
  if (store.dryRunResult) return 'deliver'
  if (reviewedYaml.value && !(store.currentDiff && store.pendingMutation)) return 'dry-run'
  if (store.currentDiff && store.pendingMutation) return 'apply'
  return 'review'
})

type RowId = 'review' | 'check' | 'deliver'

// The rail opens the row the flow is standing on, and a stage arriving resets any row the
// operator opened by hand, so the next one comes up on its own.
const openRow = computed<RowId>(() => {
  if (stage.value === 'deliver') return 'deliver'
  if (stage.value === 'dry-run') return 'check'
  return 'review'
})
const override = ref<Partial<Record<RowId, boolean>>>({})
watch(openRow, () => { override.value = {} })
const isOpen = (id: RowId) => override.value[id] ?? id === openRow.value
function setOpen(id: RowId, open: boolean) { override.value = { ...override.value, [id]: open } }

// A row is done the moment the flow has left it, and a row the flow has not reached is
// closed with the reason rather than merely unavailable.
const rowState = (id: RowId): 'done' | 'current' | 'pending' => {
  if (id === 'deliver' && delivered.value) return 'done'
  if (id === openRow.value) return 'current'
  if (id === 'review') return 'done'
  return store.dryRunResult ? 'done' : 'pending'
}

const reviewSummary = computed(() => store.newSecretDraft
  ? `Encrypted draft for ${store.newSecretDraft.name}`
  : reviewedKeys.value ? `Includes: ${reviewedKeys.value}` : '')
// The base commit is what a delivery is made against, so the row that checked it keeps
// naming it after it folds.
const checkSummary = computed(() => store.dryRunResult
  ? `Path: ${store.dryRunResult.path} · base commit ${shortBase.value}`
  : '')

async function applyPatch() {
  if (!store.currentDiff) return
  applying.value = true; error.value = ''; result.value = ''
  try {
    await store.applyReviewedMutation()
    // Nothing is written here: delivery sends the ciphertext reviewed in the diff.
    result.value = 'Reviewed patch applied. Nothing is written to Git yet — run the dry run to check it against the branch before delivering.'
  }
  catch (e) { error.value = describeError(e, 'The reviewed patch could not be applied') }
  finally { applying.value = false }
}

async function runDryRun() {
  const yaml = reviewedYaml.value
  if (!yaml || !canDeliverNow.value) return
  loading.value = true; error.value = ''; result.value = ''
  try {
    await store.dryRun(target.value.namespace, target.value.name, yaml, target.value.base_commit, target.value.target_path)
    result.value = 'Dry run complete. The server checked this change against the branch and wrote nothing.'
  }
  catch (e) { error.value = describeError(e, 'The dry run could not be completed') }
  finally { loading.value = false }
}

async function deliver() {
  const yaml = reviewedYaml.value
  if (!yaml || !canDeliverNow.value) return
  loading.value = true; error.value = ''; result.value = ''
  try {
    const response = await store.deliver(target.value.namespace, target.value.name, yaml, target.value.base_commit, target.value.target_path)
    deliveryContext.value = {
      branch: resolvedPaths.value?.branch || '',
      file: store.dryRunResult?.path || target.value.target_path || '',
      destination: destination.value,
    }
    deliveryOutcome.value = response
    delivered.value = true
    store.currentDiff = null
    store.pendingMutation = null
    store.newSecretDraft = null
  } catch (e) { error.value = describeError(e, 'The delivery could not be completed') }
  finally { loading.value = false }
}
</script>

<template>
  <AppCard v-if="hasReview" title="Encrypted review and delivery" icon="git-branch">
    <div class="flex flex-col gap-3">
      <AppAlert type="info" title="Encrypted review">
        Only encrypted manifests are shown. The server resolved the destination{{ shownDestination ? `: ${shownDestination}` : '' }} — nothing on this page chooses it.
      </AppAlert>

      <div class="rounded-card-inner border border-border">
        <StageRow
          title="Review"
          :state="rowState('review')"
          :summary="reviewSummary"
          :open="isOpen('review')"
          @update:open="setOpen('review', $event)"
        >
          <div v-if="store.currentDiff" class="flex flex-col gap-3 rounded-card-inner border border-border bg-surface-raised/70 p-3">
            <AppCode label="Encrypted before" :code="store.currentDiff.before" />
            <AppCode label="Encrypted after" :code="store.currentDiff.after" />
          </div>
          <div v-else-if="store.newSecretDraft" class="flex flex-col gap-3 rounded-card-inner border border-border bg-surface-raised/70 p-3">
            <AppCode :label="`Encrypted new SealedSecret ${store.newSecretDraft.name}`" :code="store.newSecretDraft.yaml" />
          </div>
          <AppButton
            v-if="stage === 'apply'"
            variant="primary"
            :loading="applying"
            @click="applyPatch"
          >
            Apply reviewed patch
          </AppButton>
        </StageRow>

        <StageRow
          title="Check against the branch"
          :state="rowState('check')"
          :summary="checkSummary"
          locked="Waiting on the review above."
          :open="isOpen('check')"
          @update:open="setOpen('check', $event)"
        >
          <AppButton
            v-if="stage === 'dry-run' && canDeliverNow"
            variant="primary"
            :loading="loading"
            @click="runDryRun"
          >
            Run dry run
          </AppButton>
          <div v-if="store.dryRunResult" class="flex flex-col gap-3 rounded-card-inner border border-border bg-surface-raised/70 p-3">
            <AppCode v-if="store.dryRunResult.before" label="Git before" :code="store.dryRunResult.before" />
            <!-- A new Secret has no before: one box holding an empty string says nothing, and
                 the draft it would be compared against is the row above. -->
            <AppCode v-if="store.dryRunResult.before" label="Git after" :code="store.dryRunResult.after" />
            <AppCode v-else label="What will be written" :code="store.dryRunResult.after" />
          </div>
        </StageRow>

        <StageRow
          title="Deliver"
          :state="rowState('deliver')"
          locked="Run dry run before delivery."
          :open="isOpen('deliver')"
          @update:open="setOpen('deliver', $event)"
        >
          <AppButton
            v-if="stage === 'deliver' && canDeliverNow"
            variant="primary"
            :loading="loading"
            @click="deliver"
          >
            {{ actionLabel }}
          </AppButton>
        </StageRow>
      </div>

      <AppAlert v-if="!delivered && !canDeliver" type="warning" title="Delivery unavailable">
        {{ mode ? `This namespace requires ${mode} delivery, but your effective capabilities do not include the required delivery capability.` : 'This namespace has no Git delivery policy, so the reviewed manifest cannot be delivered from here.' }}
      </AppAlert>
      <AppAlert v-else-if="!delivered && !hasBaseCommit" type="warning" title="Delivery unavailable">
        The server did not report a base commit for this change, so there is nothing to deliver against. Reload the page and try again.
      </AppAlert>

      <AppAlert v-if="error" type="error" title="Operation failed">{{ error }}</AppAlert>
      <AppAlert v-if="result" type="success" title="Workflow status">{{ result }}</AppAlert>
      <AppAlert v-if="deliveryOutcome" type="success" :title="deliveryTitle">
        <span class="block">{{ deliverySummary }}</span>
        <a
          v-if="deliveryOutcome?.proposal_url"
          :href="deliveryOutcome?.proposal_url"
          target="_blank"
          rel="noopener noreferrer"
          class="mt-1 block break-all text-accent no-underline hover:underline"
        >{{ deliveryOutcome?.proposal_url }}<span class="sr-only"> (opens in a new tab)</span></a>
        <!-- False for every delivery: this workflow writes to Git and never watches the
             cluster afterwards. -->
        <span v-if="!deliveryOutcome?.argocd_sync_verified" class="mt-1 block">ArgoCD synchronization is not verified by this workflow.</span>
      </AppAlert>
    </div>
  </AppCard>
</template>
