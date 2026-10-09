<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppAlert from '@/components/ui/AppAlert.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppCode from '@/components/ui/AppCode.vue'
import { useAuthStore } from '@/stores/auth'
import { useSecretsStore } from '@/stores/secrets'
import type { SealedSecretDetail } from '@/types'

/**
 * The panel serves two flows: editing one value of an existing Secret, and
 * creating a new one. Only the first has a SealedSecretDetail, so `detail` is
 * optional. When it is absent the namespace comes from the new-secret draft
 * and the delivery mode from the namespace's fixed Git policy.
 */
const props = defineProps<{ detail?: SealedSecretDetail }>()
const auth = useAuthStore(); const store = useSecretsStore()
const loading = ref(false); const applying = ref(false); const error = ref(''); const result = ref('')

const namespace = computed(() => store.newSecretDraft?.namespace || props.detail?.namespace || '')
const mode = computed(() => props.detail?.git.delivery_mode || store.namespaceDeliveryMode(namespace.value))
const canDeliver = computed(() => mode.value === 'direct' ? auth.hasCapability(namespace.value, 'gitops:push') : mode.value === 'proposal' ? auth.hasCapability(namespace.value, 'gitops:propose') : false)
const actionLabel = computed(() => mode.value === 'direct' ? 'Deliver directly' : 'Create proposal')
const hasReview = computed(() => Boolean(store.currentDiff || store.newSecretDraft || store.dryRunResult))
// The repository, branch, path, and mode always come from the server-side namespace policy.
//
// `target_path` follows the same rule as `base_commit`: the reviewed diff answers
// first, and the detail is the fallback. The detail's `file_path` is the file the
// server actually found the manifest in — two-tier discovery reads a Secret kept in
// an application subdirectory out of the tree walk, not from the mapping's templated
// path — so an edit delivered without it lands at the template and leaves a second
// file claiming the same SealedSecret identity. Naming the reviewed path cannot
// write outside the mapping's grant: the server resolves the destination itself and
// refuses a name that is not where this Secret already lives.
const target = computed(() => store.newSecretDraft
  ? { namespace: store.newSecretDraft.namespace, name: store.newSecretDraft.name, base_commit: store.newSecretDraft.base_commit, target_path: store.newSecretDraft.target_path }
  : { namespace: namespace.value, name: props.detail?.name || '', base_commit: store.currentDiff?.base_commit || props.detail?.git.base_commit || '', target_path: store.currentDiff?.target_path || props.detail?.git.file_path })

const reviewedYaml = computed(() => store.dryRunResult?.after || store.currentDiff?.after || store.newSecretDraft?.yaml || '')
/**
 * What the reviewed patch covers, named the way the server echoed it back:
 * keys and operations, never values. A batch can carry several changes, so the
 * operator needs to see which ones they are confirming before applying them.
 */
const reviewedKeys = computed(() => store.currentDiff?.mutations?.map((mutation) => `${mutation.operation} ${mutation.key}`).join(', ') || '')
/**
 * Both GitOps endpoints reject an empty base commit, and the server compares it
 * against the branch head. It arrives from the encrypt response for a new
 * Secret and from the detail for an existing one. When neither produced one —
 * an unmapped namespace, or a server that did not report one — there is nothing
 * to deliver against, so the delivery controls are withheld rather than offered
 * and then refused with a 400.
 */
const hasBaseCommit = computed(() => Boolean(target.value.base_commit))
/**
 * A delivery consumes the review it was made from: the diff or the draft is
 * cleared, and the base commit this panel reads goes with it. What is left to
 * report is what the delivery produced — not whether another one is available —
 * so the controls and both availability warnings stand down until the next
 * review, rather than announcing that there is nothing to deliver against
 * immediately after a delivery that succeeded.
 */
const delivered = ref(false)
const canDeliverNow = computed(() => canDeliver.value && hasBaseCommit.value && !delivered.value)
// Only a transition *into* a review re-arms the panel. A delivery clears these
// same fields, and that must not read as a new review.
watch([() => store.currentDiff, () => store.newSecretDraft], ([diff, draft]) => {
  if (diff || draft) delivered.value = false
})
// Workflow stages are mutually exclusive: apply the reviewed patch, run the
// server-side dry run, then deliver. One stage renders exactly one primary
// control, so parallel v-if chains can never ghost-duplicate a button.
const stage = computed<'review' | 'apply' | 'dry-run' | 'deliver'>(() => {
  if (store.dryRunResult) return 'deliver'
  if (reviewedYaml.value && !(store.currentDiff && store.pendingMutation)) return 'dry-run'
  if (store.currentDiff && store.pendingMutation) return 'apply'
  return 'review'
})

async function applyPatch() {
  if (!store.currentDiff) return
  applying.value = true; error.value = ''; result.value = ''
  try {
    await store.applyReviewedMutation()
    // The batch is re-validated against the live Secret here, but nothing is
    // written: delivery sends the ciphertext reviewed in the diff, and the
    // detail deliberately stays on the page so the dry run and delivery
    // controls below remain reachable.
    result.value = 'Encrypted patch confirmed and ready for dry run.'
  }
  catch (e) { error.value = e instanceof Error ? e.message : 'Patch failed' }
  finally { applying.value = false }
}

async function runDryRun() {
  const yaml = reviewedYaml.value
  if (!yaml || !canDeliverNow.value) return
  loading.value = true; error.value = ''; result.value = ''
  try {
    await store.dryRun(target.value.namespace, target.value.name, yaml, target.value.base_commit, target.value.target_path)
    result.value = 'Dry run complete.'
  }
  catch (e) { error.value = e instanceof Error ? e.message : 'Dry run failed' }
  finally { loading.value = false }
}

async function deliver() {
  const yaml = reviewedYaml.value
  if (!yaml || !canDeliverNow.value) return
  loading.value = true; error.value = ''; result.value = ''
  try {
    const response = await store.deliver(target.value.namespace, target.value.name, yaml, target.value.base_commit, target.value.target_path)
    result.value = response.proposal_url || response.commit_sha
    // The delivered ciphertext is no longer pending; the dry-run result stays
    // so the confirmation above remains visible until the user navigates away.
    delivered.value = true
    store.currentDiff = null
    store.pendingMutation = null
    store.newSecretDraft = null
  } catch (e) { error.value = e instanceof Error ? e.message : 'Delivery failed' }
  finally { loading.value = false }
}
</script>

<template>
  <AppCard v-if="hasReview" title="Encrypted review and delivery" icon="git-branch">
    <div class="flex flex-col gap-3">
      <AppAlert type="info" title="Encrypted review">Only encrypted manifests are shown. The server resolved the repository, branch, path, and delivery mode.</AppAlert>

      <div v-if="store.currentDiff" class="flex flex-col gap-3 rounded-card-inner border border-border bg-surface-raised/70 p-3">
        <AppCode label="Encrypted before" :code="store.currentDiff.before" />
        <AppCode label="Encrypted after" :code="store.currentDiff.after" />
        <p v-if="reviewedKeys" class="m-0 text-sm text-muted">Includes: {{ reviewedKeys }}</p>
      </div>

      <div v-else-if="store.newSecretDraft" class="flex flex-col gap-3 rounded-card-inner border border-border bg-surface-raised/70 p-3">
        <AppCode :label="`Encrypted new SealedSecret ${store.newSecretDraft.name}`" :code="store.newSecretDraft.yaml" />
      </div>

      <div v-if="store.dryRunResult" class="flex flex-col gap-3 rounded-card-inner border border-border bg-surface-raised/70 p-3">
        <AppCode label="Git before" :code="store.dryRunResult.before" />
        <AppCode label="Git after" :code="store.dryRunResult.after" />
        <p class="m-0 text-sm text-muted">Path: {{ store.dryRunResult.path }} · base: {{ store.dryRunResult.base_commit }}</p>
      </div>

      <AppAlert v-if="stage === 'apply'" type="warning" title="Run dry run before delivery">
        Confirm the encrypted patch, then run a server-side dry run before delivering through the {{ mode }} policy.
      </AppAlert>

      <div>
        <AppButton
          v-if="stage === 'apply'"
          variant="primary"
          :loading="applying"
          @click="applyPatch"
        >
          Apply reviewed patch
        </AppButton>
        <AppButton
          v-else-if="stage === 'dry-run' && canDeliverNow"
          variant="primary"
          :loading="loading"
          @click="runDryRun"
        >
          Run dry run
        </AppButton>
        <AppButton
          v-else-if="stage === 'deliver' && canDeliverNow"
          variant="primary"
          :loading="loading"
          @click="deliver"
        >
          {{ actionLabel }}
        </AppButton>
      </div>

      <AppAlert v-if="!delivered && !canDeliver" type="warning" title="Delivery unavailable">
        {{ mode ? `This namespace requires ${mode} delivery, but your effective capabilities do not include the required delivery capability.` : 'This namespace has no Git delivery policy, so the reviewed manifest cannot be delivered from here.' }}
      </AppAlert>
      <AppAlert v-else-if="!delivered && !hasBaseCommit" type="warning" title="Delivery unavailable">
        The server did not report a base commit for this change, so there is nothing to deliver against. Reload the page and try again.
      </AppAlert>

      <AppAlert v-if="error" type="error" title="Operation failed">{{ error }}</AppAlert>
      <AppAlert v-if="result" type="success" title="Workflow status">
        {{ result }}. ArgoCD synchronization is not verified by this workflow.
      </AppAlert>
    </div>
  </AppCard>
</template>
