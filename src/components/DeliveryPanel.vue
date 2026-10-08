<script setup lang="ts">
import { computed, ref } from 'vue'
import { NAlert, NButton, NCard, NCode, NSpace } from 'naive-ui'
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
const target = computed(() => store.newSecretDraft
  ? { namespace: store.newSecretDraft.namespace, name: store.newSecretDraft.name, base_commit: store.newSecretDraft.base_commit, target_path: store.newSecretDraft.target_path }
  : { namespace: namespace.value, name: props.detail?.name || '', base_commit: store.currentDiff?.base_commit || props.detail?.git.base_commit || '', target_path: store.currentDiff?.target_path })

const reviewedYaml = computed(() => store.dryRunResult?.after || store.currentDiff?.after || store.newSecretDraft?.yaml || '')
/**
 * Both GitOps endpoints reject an empty base commit, and the server compares it
 * against the branch head. It arrives from the encrypt response for a new
 * Secret and from the detail for an existing one. When neither produced one —
 * an unmapped namespace, or a server that did not report one — there is nothing
 * to deliver against, so the delivery controls are withheld rather than offered
 * and then refused with a 400.
 */
const hasBaseCommit = computed(() => Boolean(target.value.base_commit))
const canDeliverNow = computed(() => canDeliver.value && hasBaseCommit.value)
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
    // The patch response carries the reviewed ciphertext that the dry run and
    // delivery will use. applyReviewedMutation clears currentDetail/pending
    // mutation but keeps the diff result available until delivery.
    result.value = 'Encrypted patch applied and ready for dry run.'
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
    store.currentDiff = null
    store.pendingMutation = null
    store.newSecretDraft = null
  } catch (e) { error.value = e instanceof Error ? e.message : 'Delivery failed' }
  finally { loading.value = false }
}
</script>

<template>
  <NCard v-if="hasReview" title="Encrypted review and delivery" segmented class="glass-blur">
    <NSpace vertical>
      <NAlert type="info" title="Encrypted review">Only encrypted manifests are shown. The server resolved the repository, branch, path, and delivery mode.</NAlert>
      <div v-if="store.currentDiff" class="encrypted-diff" aria-label="Encrypted manifest diff"><strong>Encrypted before</strong><NCode :code="store.currentDiff.before" language="yaml" /><strong>Encrypted after</strong><NCode :code="store.currentDiff.after" language="yaml" /></div>
      <div v-else-if="store.newSecretDraft" class="encrypted-diff" aria-label="Encrypted new secret draft"><strong>Encrypted new SealedSecret {{ store.newSecretDraft.name }}</strong><NCode :code="store.newSecretDraft.yaml" language="yaml" /></div>
      <div v-if="store.dryRunResult" class="encrypted-diff" aria-label="Encrypted Git dry-run"><strong>Git before</strong><NCode :code="store.dryRunResult.before" language="yaml" /><strong>Git after</strong><NCode :code="store.dryRunResult.after" language="yaml" /><p>Path: {{ store.dryRunResult.path }} · base: {{ store.dryRunResult.base_commit }}</p></div>
      <NAlert v-if="stage === 'apply'" type="warning" title="Run dry run before delivery">Confirm the encrypted patch, then run a server-side dry run before delivering through the {{ mode }} policy.</NAlert>
      <NButton v-if="stage === 'apply'" type="primary" :loading="applying" @click="applyPatch">Apply reviewed patch</NButton>
      <NButton v-else-if="stage === 'dry-run' && canDeliverNow" type="primary" :loading="loading" @click="runDryRun">Run dry run</NButton>
      <NButton v-else-if="stage === 'deliver' && canDeliverNow" type="primary" :loading="loading" @click="deliver">{{ actionLabel }}</NButton>
      <NAlert v-if="!canDeliver" type="warning" title="Delivery unavailable">{{ mode ? `This namespace requires ${mode} delivery, but your effective capabilities do not include the required delivery capability.` : 'This namespace has no Git delivery policy, so the reviewed manifest cannot be delivered from here.' }}</NAlert>
      <NAlert v-else-if="!hasBaseCommit" type="warning" title="Delivery unavailable">The server did not report a base commit for this change, so there is nothing to deliver against. Reload the page and try again.</NAlert>
      <NAlert v-if="error" type="error" title="Operation failed">{{ error }}</NAlert>
      <NAlert v-if="result" type="success" title="Workflow status">{{ result }}. ArgoCD synchronization is not verified by this workflow.</NAlert>
    </NSpace>
  </NCard>
</template>
